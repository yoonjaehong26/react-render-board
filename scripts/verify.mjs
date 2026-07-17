// 판단 지점에서 스스로 QA할 때 쓰는 재현 가능한 검증 스크립트.
// 라이브 MVP를 dev 서버로 띄운 상태에서 실행한다:
//   npm run dev -- --port 5184 &
//   BASE_URL=http://localhost:5184 node scripts/verify.mjs
//
// 확인하는 것:
// 1. 초기 마운트 커밋에서 캔버스가 정상적으로 그려지는가.
// 2. 상호작용(항목 추가/삭제, 도메인 패널 토글)이 실제 재렌더를 유발하고, 캔버스가
//    매끄럽게(끊기거나 크래시 없이) 갱신되는가.
// 3. semantic zoom이 라이브 데이터에서도 줌 레벨에 따라 지도 모드/상세 모드를 전환하는가.
// 4. groupHint가 비동기로 채워진 뒤 노드가 pending 버킷에서 실제 그룹으로 옮겨가는가.
// 5. lazy+Suspense 경계(ADR-0009 ④ 미검증 항목, ADR-0011) — React.lazy로 감싼 컴포넌트가
//    Suspense fallback -> 실제 컴포넌트로 전환되는 과정에서 캔버스가 깨지지 않고, resolve된
//    컴포넌트가 "(anonymous)"가 아니라 실제 이름(LazyReportView)으로 나오는가.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5184';
const OUT_DIR = fileURLToPath(new URL('../verify-output/', import.meta.url));
const outPath = (name) => path.join(OUT_DIR, name);

// 뷰포트 기반 부분 재계산(ADR-0016 ①)이 들어간 뒤로는, 캔버스가 화면 밖(또는 지도 모드)에
// 있는 그룹의 자식 컴포넌트 노드를 아예 만들지 않는다 — 그 그룹의 개별 노드 이름/개수 변화를
// 확인하려면 먼저 그 그룹이 실제로(뷰포트 교차 + 상세 모드 줌) 펼쳐지게 만들어야 한다.
// 그룹 라벨을 더블클릭하면 React Flow가 그 지점을 중심으로 확대하므로(zoomOnDoubleClick),
// 상세 모드 임계값(55%)을 넘을 때까지 반복한다.
async function zoomIntoGroup(page, labelText, maxAttempts = 8) {
  const label = page.locator('.group-node__label', { hasText: labelText }).first();
  for (let i = 0; i < maxAttempts; i++) {
    const badge = await page.locator('.zoom-badge').textContent().catch(() => '');
    if (badge?.includes('상세 모드')) break;
    const box = await label.boundingBox();
    if (!box) break;
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(700); // 줌 애니메이션 + 뷰포트 안정화(settle) 디바운스
  }
  await page.waitForTimeout(300);
}

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

  // 1. 초기 마운트
  await page.waitForSelector('.react-flow__node', { timeout: 5000 });
  let nodeCount = await page.locator('.react-flow__node').count();
  console.log(`[verify] 초기 마운트 후 React Flow 노드 수: ${nodeCount}`);
  await page.screenshot({ path: outPath('01-initial.png') });

  // groupHint가 async로 채워질 시간을 준다 (ADR-0007).
  await page.waitForTimeout(600);
  await page.screenshot({ path: outPath('02-after-group-hint.png') });
  const pendingLabelCount = await page.locator('text=그룹 확인 중').count();
  console.log(`[verify] groupHint 해석 후 남은 pending 그룹 라벨 수: ${pendingLabelCount} (0이어야 정상)`);

  // 2. 리스트 항목 추가 (shell 도메인) — 노드 추가 커밋
  // AppShell.tsx 그룹이 뷰포트 밖/지도 모드에 있으면 자식이 아예 안 만들어지므로(ADR-0016 ①)
  // 먼저 그 그룹으로 줌인해 상세 모드로 들어간다.
  await zoomIntoGroup(page, 'AppShell.tsx');
  await page.getByRole('button', { name: '항목 추가' }).click();
  await page.waitForTimeout(300);
  const afterAdd = await page.locator('.react-flow__node').count();
  console.log(`[verify] '항목 추가' 클릭 후 노드 수: ${afterAdd} (증가해야 정상)`);

  // 카운터 클릭 — state 업데이트만, 구조 변화 없는 커밋
  await page.getByRole('button', { name: /count is/ }).click();
  await page.getByRole('button', { name: /count is/ }).click();
  await page.waitForTimeout(200);

  // checkout 도메인에 항목 추가 — 다른 그룹에 노드 추가
  await page.getByRole('button', { name: '상품 담기' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: outPath('03-after-interactions.png') });

  // 3. notifications 패널 통째로 마운트 — 그룹이 새로 생기는지 확인
  // 그룹 "라벨 목록"은 전체를 한눈에 봐야 의미가 있으므로, 위 2번 단계에서 AppShell.tsx로
  // 줌인해둔 카메라를 다시 전체 화면에 맞춘다 — onlyRenderVisibleElements가 화면 밖 그룹
  // 프레임까지 DOM에서 걸러내므로, 안 그러면 지금 화면에 든 몇 개 그룹만 보인다.
  await page.locator('.react-flow__controls-fitview').click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '알림 패널 보이기' }).click();
  await page.waitForTimeout(600); // groupHint 해석까지 포함
  const groupLabels = await page.locator('.group-node__label').allTextContents();
  console.log('[verify] 알림 패널 표시 후 그룹 라벨들:', groupLabels);
  await page.screenshot({ path: outPath('04-notifications-mounted.png') });

  // 패널을 다시 숨겨 그룹이 사라지는지 확인
  await page.getByRole('button', { name: '알림 패널 숨기기' }).click();
  await page.waitForTimeout(300);
  const groupLabelsAfterHide = await page.locator('.group-node__label').allTextContents();
  console.log('[verify] 알림 패널 숨긴 후 그룹 라벨들:', groupLabelsAfterHide);
  await page.screenshot({ path: outPath('05-notifications-unmounted.png') });

  // 4. semantic zoom: 캔버스 줌 아웃 -> 지도 모드 전환 확인
  const canvas = page.locator('.canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 120); // React Flow: wheel down = zoom out
  }
  await page.waitForTimeout(300);
  const zoomBadge = await page.locator('.zoom-badge').textContent();
  console.log('[verify] 줌 아웃 후 배지:', zoomBadge);
  const isMapMode = await page.locator('.canvas.zoom-far').count();
  console.log(`[verify] 지도 모드 클래스 적용 여부: ${isMapMode > 0}`);
  await page.screenshot({ path: outPath('06-zoomed-out.png') });

  // 5. lazy+Suspense 경계 검증 (ReportsPanel — React.lazy + Suspense, ADR-0011)
  await page.getByRole('button', { name: '보고서 열기' }).click();
  await page.waitForTimeout(50);
  const fallbackVisible = await page.locator('text=보고서 로딩 중').count();
  console.log(`[verify] Suspense fallback 표시 여부: ${fallbackVisible > 0} (true여야 정상 — 즉시 사라지면 지연 로직 확인)`);
  await page.screenshot({ path: outPath('07-lazy-suspense-fallback.png') });

  await page.waitForTimeout(700); // lazy 모듈 resolve(400ms) + groupHint 해석 대기
  const fallbackGoneAfterResolve = await page.locator('text=보고서 로딩 중').count();
  // 바로 위 4번 단계에서 캔버스를 지도 모드까지 줌아웃했으므로, ReportsPanel.tsx 그룹으로
  // 다시 줌인해야 그 안의 LazyReportView 자식 노드가 실제로 만들어진다(ADR-0016 ①).
  await zoomIntoGroup(page, 'ReportsPanel.tsx');
  const lazyNodeVisible = await page.locator('.component-node__name', { hasText: 'LazyReportView' }).count();
  console.log(`[verify] resolve 후 fallback 사라짐: ${fallbackGoneAfterResolve === 0}, lazy 컴포넌트가 실제 이름(LazyReportView)으로 노드에 표시됨: ${lazyNodeVisible > 0}`);
  await page.screenshot({ path: outPath('08-lazy-suspense-resolved.png') });

  console.log(`[verify] 콘솔 에러 개수: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log('[verify] 콘솔 에러 내용:', consoleErrors);
  }

  await browser.close();
  console.log(`[verify] 완료. 스크린샷: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[verify] 실패', err);
  process.exit(1);
});
