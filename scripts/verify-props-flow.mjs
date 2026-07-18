// ADR-0032 검증 스크립트 — props 흐름 추적(간선 경로) + 변경 잔상(afterglow).
// 라이브 MVP를 dev 서버로 띄운 상태에서 실행한다:
//   npm run dev -- --port 5188 &
//   BASE_URL=http://localhost:5188 node scripts/verify-props-flow.mjs
//
// DataFlowPanel fixture(src/fixtures/domains/dataflow)를 대상으로 한다 — 같은 `data` 객체를
// DataFlowList → DataFlowRow → DataFlowBadge로 drilling하고 1.5s마다 새 객체로 교체하므로,
// 정적 primitive만 넘기는 다른 fixture와 달리 props 흐름/변경/잔상이 클릭 한 번에 다 드러난다.
//
// 확인하는 것:
// 1. 노드 선택 → props 패널(우선순위 정렬 리스트). `data`(객체) 행이 위, 얕은 미리보기만.
// 2. 변경 감지(b1) — `data`가 1.5s마다 새 참조라 선택된 노드 패널에 "변경됨" 배지가 뜬다.
// 3. 참조 추적을 **간선 경로**로 표시 — `data` 행 클릭 → 그 참조를 물려받은 자손 노드(끝점 표식)와
//    그 사이 기존 부모→자식 간선(.edge-tracked, 흐르는 점선 + prop 이름 라벨)이 강조된다.
// 4. 변경 잔상 — 잔상 토글을 켜면 1.5s 갱신마다 그 노드들이 발광하고, 일시정지하면 얼어붙는다.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openBoard } from './lib/openBoard.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5188';
const OUT_DIR = fileURLToPath(new URL('../verify-output/props-flow/', import.meta.url));
const outPath = (name) => path.join(OUT_DIR, name);

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  await openBoard(page);
  await page.waitForSelector('.react-flow__node', { timeout: 5000 });
  await page.waitForTimeout(800); // groupHint 비동기 해석 대기

  // DataFlow 서브트리를 검색으로 데려와 강제 확장 + 카메라 이동. 'DataFlow'는 List/Row/Badge를
  // 모두 매치해 그 그룹이 펼쳐진다.
  const search = page.locator('.toolbar__search');
  await search.fill('DataFlow');
  await page.waitForTimeout(800);

  // --- 1 & 2. DataFlowList 선택 → props 패널 + 변경됨 배지 ---
  const listNode = page
    .locator('.component-node', { has: page.locator('.component-node__name', { hasText: 'DataFlowList' }) })
    .first();
  await listNode.waitFor({ state: 'visible', timeout: 5000 });
  await listNode.click({ force: true });
  await page.waitForTimeout(300);

  const panelVisible = (await page.locator('.props-panel').count()) > 0;
  const rowsText = await page.locator('.props-row').allTextContents();
  console.log(`[verify-props] 1. 노드 클릭 → props 패널 표시: ${panelVisible}, 행: ${JSON.stringify(rowsText)}`);

  const hasDataRow = (await page.locator('.props-row', { has: page.locator('.props-row__key', { hasText: 'data' }) }).count()) > 0;
  console.log(`[verify-props] 1. 추적 가능한 객체 prop 'data' 행 존재: ${hasDataRow}`);

  // data는 1.5s마다 새 객체 → 다음 갱신 후 "변경됨" 배지가 떠야 한다.
  await page.waitForTimeout(1800);
  const changedBadge = await page.locator('.props-row__badge--changed').count();
  console.log(`[verify-props] 2. 갱신 후 패널에 "변경됨" 배지 표시 수: ${changedBadge} (1 이상이어야 정상)`);
  await page.screenshot({ path: outPath('01-panel-changed.png') });

  // --- 3. 자동 추적 → 간선 경로 강조 (row를 클릭하지 않고 "선택만"으로) ---
  // 노드를 선택하면 대표 prop(data)이 자동 추적돼야 한다 — row 클릭 없이도 간선이 강조된다.
  const autoTrackBadge = (await page.locator('.props-row__badge--tracked').count()) > 0;
  const trackedNodes = await page.locator('.component-node--tracked').count();
  const trackedEdges = await page.locator('.react-flow__edge.edge-tracked').count();
  const edgeLabel = await page
    .locator('.react-flow__edge.edge-tracked .react-flow__edge-text')
    .first()
    .textContent()
    .catch(() => null);
  console.log(`[verify-props] 3. 노드 선택만으로 자동 추적("추적 중" 배지): ${autoTrackBadge} (row 클릭 없이)`);
  console.log(`[verify-props] 3. 흐름 끝점 노드 표식 수: ${trackedNodes} (1 이상)`);
  console.log(`[verify-props] 3. 참조가 지나간 간선 강조 수(.edge-tracked): ${trackedEdges} (1 이상이어야 정상)`);
  console.log(`[verify-props] 3. 강조 간선의 흐르는 prop 이름 라벨: ${JSON.stringify(edgeLabel)} (기대: "data")`);
  await page.screenshot({ path: outPath('02-edge-path-tracking.png') });

  // 패널 닫기(=선택 해제 → 추적도 해제). DataFlow 검색은 유지(잔상 감지 대상이 flowNodes에 남아야 함).
  await page.locator('.props-panel__close').click();
  await page.waitForTimeout(200);

  // --- 4. 흐름 — 데이터가 부모→자식 간선을 타고 흐름(애니메이션) + 노드 표식 + 일시정지로 고정 ---
  await page.getByRole('button', { name: 'props 흐름 보기' }).click();
  const afterglowOn = (await page.getByRole('button', { name: /흐름 보는 중/ }).count()) > 0;
  console.log(`[verify-props] 4. 흐름 토글 켜짐: ${afterglowOn}`);

  // 상세 모드로 줌인한다 — 노드 단위 흐름은 상세 모드에서만 보이는데, 'DataFlow' 검색 fitView
  // 줌은 앱 전체 노드 수(동시 세션이 계속 늘림)에 따라 지도 모드로 떨어질 수 있어서다. 컨트롤의
  // 줌인 버튼을 조금씩 눌러(중심 유지) 상세 모드까지만 올려 서브트리 간선이 프레임에 남게 한다.
  {
    const zoomIn = page.getByRole('button', { name: /zoom in/i });
    for (let i = 0; i < 10; i++) {
      const badge = await page.locator('.zoom-badge').textContent().catch(() => '');
      if (badge?.includes('상세 모드')) break;
      await zoomIn.click();
      await page.waitForTimeout(220);
    }
    await page.waitForTimeout(300); // 뷰포트 안정(VIEWPORT_SETTLE_MS)
  }

  await page.waitForTimeout(1800); // DataFlow가 한 번 이상 갱신돼 heat가 오를 시간
  const glowCount = await page.locator('.component-node__afterglow').count();
  const hotEdges = await page.locator('.react-flow__edge.edge-hot').count();
  console.log(`[verify-props] 4. props가 바뀐 노드 표식 수: ${glowCount} (1 이상이어야 정상)`);
  console.log(`[verify-props] 4. 클릭 없이 데이터가 흐르는 간선(.edge-hot, 부모→자식 애니메이션) 수: ${hotEdges} (1 이상이어야 정상)`);
  await page.screenshot({ path: outPath('03-afterglow.png') });

  await page.getByRole('button', { name: '일시정지' }).click();
  const pausedLabel = (await page.getByRole('button', { name: '재생' }).count()) > 0;
  await page.waitForTimeout(1000); // decay가 계속됐다면(=freeze 미동작) 이 사이 식었을 시간
  const glowAfterPause = await page.locator('.component-node__afterglow').count();
  console.log(`[verify-props] 4. 일시정지 버튼이 "▶ 재생"으로 바뀜: ${pausedLabel}`);
  console.log(
    `[verify-props] 4. 일시정지 중 발광 유지(식지 않음): ${glowAfterPause} (일시정지 전 ${glowCount}개와 비슷해야 정상)`,
  );
  await page.screenshot({ path: outPath('04-afterglow-paused.png') });

  // --- 5. 지도 모드 그룹 흐름(ADR-0032 Q2 "활동 기상도") — 줌아웃해도 흐름이 그룹 단위로 읽힘 ---
  await page.getByRole('button', { name: '재생' }).click(); // 일시정지 해제(스냅샷 다시 흐르게)
  await page.waitForTimeout(200);
  const zoomOut = page.getByRole('button', { name: /zoom out/i });
  for (let i = 0; i < 24; i++) {
    const badge = await page.locator('.zoom-badge').textContent().catch(() => '');
    if (badge?.includes('지도 모드')) break;
    await zoomOut.click();
    await page.waitForTimeout(120);
  }
  const mapMode = (await page.locator('.zoom-badge').textContent().catch(() => ''))?.includes('지도 모드');
  console.log(`[verify-props] 5. 지도 모드로 줌아웃: ${mapMode}`);
  await page.waitForTimeout(2400); // DataFlow가 갱신돼 그룹 heat가 집계될 시간
  const flowingGroups = await page.locator('.group-node--flowing').count();
  const groupFlowEdges = await page.locator('.react-flow__edge.edge-hot').count();
  console.log(`[verify-props] 5. 바쁜 도메인(그룹 프레임 발광) 수: ${flowingGroups} (1 이상이어야 정상)`);
  console.log(`[verify-props] 5. 도메인 간 흐르는 간선(.edge-hot, 그룹↔그룹) 수: ${groupFlowEdges} (1 이상이어야 정상)`);
  await page.screenshot({ path: outPath('05-map-mode-group-flow.png') });

  console.log(`[verify-props] 콘솔 에러 개수: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) console.log('[verify-props] 콘솔 에러 내용:', consoleErrors);

  await browser.close();
  console.log(`[verify-props] 완료. 스크린샷: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[verify-props] 실패', err);
  process.exit(1);
});
