// ADR-0027 검증 스크립트 — 검색 하이라이트+자동 이동, 다크모드+도메인 팔레트.
// 라이브 MVP를 dev 서버로 띄운 상태에서 실행한다:
//   npm run dev -- --port 5188 &
//   BASE_URL=http://localhost:5188 node scripts/verify-search-and-theme.mjs
//
// 확인하는 것:
// 1. 검색 — 쿼리를 치면 매치된 노드가 강조(.component-node--matched)되고 나머지는 흐려지며
//    (.canvas.search-active), 매치가 지금 뷰포트 밖/지도 모드로 접힌 그룹 안에 있어도 자동으로
//    그 그룹이 펼쳐지고 카메라가 이동해 상세 모드로 전환된다(ADR-0027이 발견한, shouldExpandGroup에
//    강제 확장을 추가하지 않으면 매치된 노드가 flowNodes에 아예 없어 생기는 gap의 회귀 확인).
//    쿼리를 지우면 원상복구되고, 매치 0건이면 전체가 흐려지며 "0건 일치"가 표시된다.
// 2. 다크모드 — 토글하면 .react-flow에 dark 클래스가 붙고(xyflow 자체 크롬), .react-flow
//    "밖"에 있는 .toolbar/.board-panel도 body.rrb-dark-mode로 스타일이 도달하며, 서로 다른
//    도메인의 그룹 프레임이 서로 다른 팔레트 색(border-color)을 받는다. 새로고침해도
//    localStorage로 선택이 유지된다.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openBoard } from './lib/openBoard.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5188';
const OUT_DIR = fileURLToPath(new URL('../verify-output/search-and-theme/', import.meta.url));
const outPath = (name) => path.join(OUT_DIR, name);

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await openBoard(page);
  await page.waitForSelector('.react-flow__node', { timeout: 5000 });
  await page.waitForTimeout(600); // groupHint 비동기 해석 대기

  // --- 1. 검색: 뷰포트 밖/지도 모드로 접혀 있을 수 있는 그룹을 자동으로 펼치고 카메라 이동 ---
  // "CheckoutItem"은 CheckoutPanel.tsx 그룹 안에서만 등장하는 이름이라(usage-site 노드인
  // "CheckoutPanel" 자체는 ADR-0007에 따라 DemoApp.tsx 그룹에 따로 잡힌다 — 그걸 같이 매치
  // 시키면 두 그룹에 걸쳐 매치가 흩어져 fitView 대상 바운딩 박스가 캔버스 전체 폭만큼
  // 넓어지는, 문서화된 트레이드오프 케이스가 된다) 매치가 한 그룹 안에 좁게 뭉치므로
  // "지도 모드 탈출"을 깨끗하게 확인할 수 있다.
  const searchInput = page.locator('.toolbar__search');
  await searchInput.fill('CheckoutItem');
  await page.waitForTimeout(1000); // 디바운스(300ms) + fitView 애니메이션(400ms) + 여유

  const searchActiveAfterQuery = (await page.locator('.canvas.search-active').count()) > 0;
  console.log(`[verify-search-theme] 검색: 쿼리 입력 시 .canvas.search-active 부여: ${searchActiveAfterQuery}`);

  const matchedCount = await page.locator('.component-node--matched').count();
  console.log(`[verify-search-theme] 검색: 매치된 컴포넌트 노드 수: ${matchedCount} (1 이상이어야 정상)`);

  const searchCountText = await page.locator('.toolbar__search-count').textContent().catch(() => null);
  console.log(`[verify-search-theme] 검색: 매치 개수 표시: "${searchCountText}"`);

  const zoomBadgeAfterSearch = await page.locator('.zoom-badge').textContent().catch(() => '');
  console.log(
    `[verify-search-theme] 검색: 매치 노드로 fitView한 뒤 상세 모드로 전환됨(지도 모드 탈출): ${zoomBadgeAfterSearch?.includes('상세 모드')}`,
  );
  await page.screenshot({ path: outPath('01-search-matched.png') });

  // 쿼리를 지우면 원상복구 — 카메라는 그대로 두고 dimming/강조만 사라진다.
  await searchInput.fill('');
  await page.waitForTimeout(200);
  const searchActiveAfterClear = (await page.locator('.canvas.search-active').count()) > 0;
  const matchedAfterClear = await page.locator('.component-node--matched').count();
  console.log(
    `[verify-search-theme] 검색: 쿼리 삭제 후 search-active 제거: ${!searchActiveAfterQuery || !searchActiveAfterClear}, matched 클래스 잔여: ${matchedAfterClear}`,
  );

  // 매치 0건 — 전체가 흐려지고 "0건 일치"가 뜬다.
  await searchInput.fill('zzz-no-such-component-xyz');
  await page.waitForTimeout(500);
  const zeroMatchCountText = await page.locator('.toolbar__search-count').textContent().catch(() => null);
  console.log(`[verify-search-theme] 검색: 매치 0건일 때 표시: "${zeroMatchCountText}"`);

  const dimmedOpacity = await page
    .locator('.canvas.search-active .component-node')
    .first()
    .evaluate((el) => getComputedStyle(el).opacity)
    .catch(() => null);
  console.log(`[verify-search-theme] 검색: 매치 0건일 때 컴포넌트 노드 opacity: ${dimmedOpacity} (0.25 근방이어야 정상)`);

  await searchInput.fill('');
  await page.waitForTimeout(200);

  // --- 2. 다크모드 + 도메인 팔레트 ---
  const groupBordersBefore = await page
    .locator('.group-node')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).borderColor));
  console.log(`[verify-search-theme] 다크모드 전: 화면에 보이는 그룹 프레임 수: ${groupBordersBefore.length}`);

  await page.locator('.toolbar__theme-toggle').click();
  await page.waitForTimeout(200);

  const darkClassOnReactFlow = (await page.locator('.react-flow.dark').count()) > 0;
  const bodyHasDarkClass = await page.evaluate(() => document.body.classList.contains('rrb-dark-mode'));
  console.log(`[verify-search-theme] 다크모드: .react-flow.dark 부여: ${darkClassOnReactFlow}, body.rrb-dark-mode 부여: ${bodyHasDarkClass}`);
  await page.screenshot({ path: outPath('02-dark-mode.png') });

  const groupBordersAfter = await page
    .locator('.group-node')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).borderColor));
  const distinctGroupColors = new Set(groupBordersAfter);
  console.log(
    `[verify-search-theme] 도메인 팔레트: 화면에 보이는 그룹 프레임의 서로 다른 테두리 색 개수: ${distinctGroupColors.size} (그룹이 2개 이상 보이면 2 이상이어야 정상)`,
  );

  // --- 3. 새로고침 후에도 다크모드 선택이 유지되는가(localStorage) ---
  await page.reload({ waitUntil: 'networkidle' });
  await openBoard(page);
  await page.waitForSelector('.react-flow__node', { timeout: 5000 });
  const darkPersistedAfterReload = (await page.locator('.react-flow.dark').count()) > 0;
  console.log(`[verify-search-theme] 다크모드: 새로고침 후에도 유지됨(localStorage): ${darkPersistedAfterReload}`);

  console.log(`[verify-search-theme] 콘솔 에러 개수: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log('[verify-search-theme] 콘솔 에러 내용:', consoleErrors);
  }

  await browser.close();
  console.log(`[verify-search-theme] 완료. 스크린샷: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[verify-search-theme] 실패', err);
  process.exit(1);
});
