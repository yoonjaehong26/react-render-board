// ADR-0029 결정 #4 검증 스크립트 — 간선 클러터 감쇠(시각적 감쇠 + 단계형 LOD).
// 라이브 MVP를 dev 서버로 띄운 상태에서 실행한다:
//   npm run dev -- --port 5191 &
//   BASE_URL=http://localhost:5191 node scripts/verify-edge-clutter.mjs
//
// DeepTree fixture(src/fixtures/domains/deeptree)를 대상으로 한다 — Level1~Level6이 모두 같은
// 파일(=같은 그룹)이라 그룹 내 깊이가 1~5까지 이어진다. 깊이 3 이상이 edge-detail이라 단계형
// LOD의 숨김/표시를 실제로 관찰할 수 있다(다른 fixture들은 그룹 내 깊이가 최대 2뿐이다 —
// getSource "사용 위치" 그룹핑 때문에 한 그룹이 얕게 잘린다).
//
// 확인하는 것(연구문서 7절 a·b):
// a. 시각적 감쇠 — 그룹 내 간선(edge-same-group)은 깊을수록 opacity가 낮다(edge-depth-1>2>3).
//    그룹 간 간선(edge-cross-group)은 감쇠 대상이 아니라 opacity 1을 유지한다.
// b. 단계형 LOD — 상세 모드 안에서 중간 줌(zoom-mid)이면 깊은 간선(edge-detail)이 숨고,
//    더 줌인하면(zoom-mid 해제) 다시 나타난다. 지도 모드(zoom-far)는 기존대로 노드 간선 전부 숨김.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openBoard } from './lib/openBoard.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5191';
const OUT_DIR = fileURLToPath(new URL('../verify-output/edge-clutter/', import.meta.url));
const outPath = (name) => path.join(OUT_DIR, name);

// 캔버스 중앙에서 휠 줌으로 목표 줌%(zoom-badge가 표시하는 값) 근처에 도달할 때까지 스크롤한다.
// React Flow 기본값에서 휠은 줌이다(deltaY<0 = 줌인). 정확한 값 대신 목표 밴드에 들어오면 멈춘다.
async function zoomToPercent(page, targetPct, tolerance = 6) {
  const box = await page.locator('.react-flow').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  const readPct = async () => {
    const txt = (await page.locator('.zoom-badge').textContent()) ?? '';
    const m = txt.match(/(\d+)%/);
    return m ? Number(m[1]) : NaN;
  };
  for (let i = 0; i < 60; i++) {
    const cur = await readPct();
    if (!Number.isNaN(cur) && Math.abs(cur - targetPct) <= tolerance) return cur;
    const delta = cur < targetPct ? -220 : 220; // 낮으면 줌인(음수), 높으면 줌아웃(양수)
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(120);
  }
  return readPct();
}

// 현재 DOM의 노드 레벨 간선(그룹↔그룹 집계 edge-group-link 제외)을 className + 실효 opacity로 수집.
async function collectEdges(page) {
  return page.$$eval('.react-flow__edge', (els) =>
    els
      .map((el) => ({
        id: el.getAttribute('data-id'),
        cls: el.getAttribute('class') ?? '',
        opacity: Number(getComputedStyle(el).opacity),
      }))
      .filter((e) => !e.cls.includes('edge-group-link')),
  );
}

const bucket = (edges, token) => edges.filter((e) => e.cls.includes(token));
const avgOpacity = (list) => (list.length ? list.reduce((s, e) => s + e.opacity, 0) / list.length : NaN);

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleErrors = [];
  page.on('console', (msg) => msg.type() === 'error' && consoleErrors.push(msg.text()));
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await openBoard(page);
  await page.waitForSelector('.react-flow__node', { timeout: 5000 });
  await page.waitForTimeout(800); // groupHint 비동기 해석 대기

  // DeepTree 그룹을 검색으로 데려와 강제 확장 + 카메라 이동. 'Level'이 Level1~Level6을 모두 매치.
  await page.locator('.toolbar__search').fill('Level');
  await page.waitForTimeout(900);

  let pass = true;
  const fail = (msg) => {
    pass = false;
    console.log(`  ✗ ${msg}`);
  };
  const ok = (msg) => console.log(`  ✓ ${msg}`);

  // --- near 줌: 전부 표시 상태에서 깊이별 감쇠 관찰 ---
  const nearPct = await zoomToPercent(page, 110);
  await page.waitForTimeout(250);
  const nearClass = await page.locator('.canvas').getAttribute('class');
  const nearEdges = await collectEdges(page);
  await page.screenshot({ path: outPath('01-near-all-edges.png') });

  const d1 = bucket(nearEdges, 'edge-depth-1');
  const d2 = bucket(nearEdges, 'edge-depth-2');
  const d3 = bucket(nearEdges, 'edge-depth-3');
  const cross = bucket(nearEdges, 'edge-cross-group');
  const detail = bucket(nearEdges, 'edge-detail');
  console.log(
    `\n[a. 시각적 감쇠] near 줌 ${nearPct}% (${nearClass?.includes('zoom-near') ? 'zoom-near' : nearClass}):`,
  );
  console.log(
    `  깊이별 간선 수 — d1:${d1.length} d2:${d2.length} d3:${d3.length} / cross-group:${cross.length} / detail:${detail.length}`,
  );
  console.log(
    `  평균 opacity — d1:${avgOpacity(d1).toFixed(2)} d2:${avgOpacity(d2).toFixed(2)} d3:${avgOpacity(d3).toFixed(2)} cross:${avgOpacity(cross).toFixed(2)}`,
  );

  if (d3.length === 0) fail('깊이 3(edge-detail) 간선이 없다 — DeepTree 그룹이 안 펼쳐졌거나 fixture 변경?');
  else ok(`깊이 3(edge-detail) 간선 ${d3.length}개 존재`);
  // 감쇠 단조성: 그룹 내는 깊을수록 옅게, 그룹 간은 감쇠 없이 1.
  if (d1.length && d2.length && avgOpacity(d1) > avgOpacity(d2) && avgOpacity(d2) > avgOpacity(d3))
    ok('그룹 내 간선 opacity가 깊이에 따라 단조 감소(d1>d2>d3)');
  else fail(`감쇠 단조성 위반 — d1:${avgOpacity(d1)} d2:${avgOpacity(d2)} d3:${avgOpacity(d3)}`);
  if (cross.length && avgOpacity(cross) > 0.99) ok('그룹 간 간선(cross-group)은 감쇠 없이 opacity≈1 유지');
  else if (cross.length) fail(`cross-group이 감쇠됨 — opacity ${avgOpacity(cross)}`);
  if (d3.length && detail.every((e) => e.opacity > 0)) ok('near 줌에선 depth-3 detail 간선이 보인다(opacity>0)');
  else if (d3.length) fail('near 줌인데 detail 간선이 안 보인다');

  // --- mid 줌: 구조 간선만, detail 숨김 ---
  const midPct = await zoomToPercent(page, 70); // MAP(55%)~DETAIL(90%) 사이
  await page.waitForTimeout(250);
  const midClass = await page.locator('.canvas').getAttribute('class');
  const midEdges = await collectEdges(page);
  await page.screenshot({ path: outPath('02-mid-structural-only.png') });

  const midDetail = bucket(midEdges, 'edge-detail');
  const midStructural = midEdges.filter((e) => !e.cls.includes('edge-detail'));
  console.log(`\n[b. 단계형 LOD] mid 줌 ${midPct}% (${midClass?.includes('zoom-mid') ? 'zoom-mid' : midClass}):`);
  console.log(`  detail 간선 평균 opacity: ${avgOpacity(midDetail).toFixed(2)} (기대 0)`);
  console.log(`  구조 간선(비-detail) 평균 opacity: ${avgOpacity(midStructural).toFixed(2)} (기대 >0)`);

  if (midClass?.includes('zoom-mid')) ok('중간 줌 대역에서 .canvas에 zoom-mid 클래스 적용됨');
  else fail(`zoom-mid가 안 붙음 — class=${midClass}`);
  if (midDetail.length && midDetail.every((e) => e.opacity === 0)) ok('mid 줌에서 depth-3 detail 간선이 전부 숨겨짐(opacity 0)');
  else if (midDetail.length) fail(`mid 줌인데 detail 간선이 안 숨겨짐 — opacity ${avgOpacity(midDetail)}`);
  if (midStructural.some((e) => e.opacity > 0)) ok('mid 줌에서도 구조 간선(cross-group + 얕은 깊이)은 보인다');
  else fail('mid 줌에서 구조 간선까지 사라짐(과잉 숨김)');

  // --- far 줌: 지도 모드, 노드 간선 전부 숨김(기존 동작 회귀 확인) ---
  const farPct = await zoomToPercent(page, 30);
  await page.waitForTimeout(250);
  const farClass = await page.locator('.canvas').getAttribute('class');
  const farEdges = await collectEdges(page);
  await page.screenshot({ path: outPath('03-far-map-mode.png') });
  console.log(`\n[회귀] far 줌 ${farPct}% (${farClass?.includes('zoom-far') ? 'zoom-far' : farClass}):`);
  const farVisible = farEdges.filter((e) => e.opacity > 0);
  if (farClass?.includes('zoom-far')) ok('지도 모드에서 .canvas에 zoom-far 적용됨');
  else fail(`zoom-far가 안 붙음 — class=${farClass}`);
  // 지도 모드는 그룹이 접혀 노드 간선이 아예 안 만들어지거나(주 경로) 만들어져도 opacity 0.
  if (farVisible.length === 0) ok('지도 모드에서 노드 레벨 간선이 보이지 않음(기존 semantic zoom 회귀 OK)');
  else fail(`지도 모드인데 노드 간선 ${farVisible.length}개가 보인다`);

  console.log(`\n[verify-edge-clutter] 콘솔 에러 개수: ${consoleErrors.length}`);
  if (consoleErrors.length) console.log('  에러:', consoleErrors);
  console.log(`[verify-edge-clutter] 스크린샷: ${OUT_DIR}`);

  await browser.close();
  if (!pass || consoleErrors.length) {
    console.error('[verify-edge-clutter] 실패 — 위 ✗ 항목 확인');
    process.exit(1);
  }
  console.log('[verify-edge-clutter] 전부 통과 ✓');
}

main().catch((err) => {
  console.error('[verify-edge-clutter] 실패', err);
  process.exit(1);
});
