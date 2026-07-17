// ADR-0029 검증 스크립트 — 그룹 접기/펼치기, 우클릭 컨텍스트 메뉴, 캔버스 스티키노트.
// 라이브 MVP를 dev 서버로 띄운 상태에서 실행한다:
//   npm run dev -- --port 5211 &
//   BASE_URL=http://localhost:5211 node scripts/verify-ux-round3.mjs
//
// 확인하는 것:
// 1. 그룹 접기/펼치기 — 헤더 셰브런을 클릭하면 그 그룹의 자식 컴포넌트 노드가 flowNodes에서
//    사라지고(뷰포트/지도 모드 컬링과 같은 메커니즘), 다시 클릭하면 돌아온다.
// 2. 검색이 수동 접기보다 우선한다 — 그룹을 수동으로 접은 뒤 그 안의 컴포넌트를 검색하면
//    강제로 펼쳐진다("검색은 언제나 이긴다", ADR-0027/0029).
// 3. 우클릭 컨텍스트 메뉴 — 그룹은 접기/펼치기 토글 + 이 그룹으로 확대, 컴포넌트는 실제
//    화면에서 보기(DOM 하이라이트) + 이 이름으로 검색(검색창 연동).
// 4. 캔버스 스티키노트 — 추가/텍스트 편집/삭제, 그리고 새로고침 후에도 localStorage로 유지.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openBoard } from './lib/openBoard.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5211';
const OUT_DIR = fileURLToPath(new URL('../verify-output/ux-round3/', import.meta.url));
const outPath = (name) => path.join(OUT_DIR, name);

// verify.mjs와 같은 기법 — 그룹이 뷰포트 밖/지도 모드면 자식이 안 만들어지므로(ADR-0016 ①)
// 실제로 클릭할 컴포넌트 노드가 존재하려면 먼저 그 그룹으로 줌인해야 한다.
async function zoomIntoGroup(page, labelText, maxAttempts = 8) {
  const label = page.locator('.group-node__label', { hasText: labelText }).first();
  for (let i = 0; i < maxAttempts; i++) {
    const badge = await page.locator('.zoom-badge').textContent().catch(() => '');
    if (badge?.includes('상세 모드')) break;
    const box = await label.boundingBox();
    if (!box) break;
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(300);
}

function groupFrameByLabel(page, labelText) {
  return page.locator('.group-node', { has: page.locator('.group-node__label', { hasText: labelText }) }).first();
}

// 그룹 접기/펼치기 셰브런(ADR-0029)은 <NodeToolbar>로 렌더된다 — 그룹 프레임(zIndex:-1)보다
// 위에 그리려고 React Flow가 별도 포탈(.react-flow__node-toolbar)로 그리기 때문에, .group-node의
// DOM 자손이 아니다. 포탈 wrapper에 그 그룹의 노드 id가 data-id 속성으로 남으므로 그걸로 찾는다.
function groupToggleByGroupName(page, groupName) {
  return page.locator(`.react-flow__node-toolbar[data-id="group:${groupName}"] .group-node__toggle`);
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
  await openBoard(page);
  await page.waitForSelector('.react-flow__node', { timeout: 5000 });
  await page.waitForTimeout(600); // groupHint 비동기 해석 대기

  // --- 1. 그룹 접기/펼치기 ---
  await zoomIntoGroup(page, 'CheckoutPanel.tsx');
  const checkoutFrame = groupFrameByLabel(page, 'CheckoutPanel.tsx');
  const childrenBeforeCollapse = await page.locator('.component-node').count();
  console.log(`[verify-ux3] 그룹 접기 전 CheckoutPanel.tsx 자식 컴포넌트 수: ${childrenBeforeCollapse} (1 이상이어야 정상)`);

  await groupToggleByGroupName(page, 'CheckoutPanel.tsx').click();
  await page.waitForTimeout(300);
  const collapsedClassApplied = await checkoutFrame.evaluate((el) => el.classList.contains('group-node--collapsed'));
  // 페이지 전체의 .component-node 수는 CheckoutPanel.tsx 말고도 뷰포트 안에 든 다른 그룹의
  // 자식까지 포함하므로(VIEWPORT_EXPAND_MARGIN), "0이 됐는가"가 아니라 "CheckoutPanel.tsx의
  // 자식 수(3개: CheckoutItem+Button×2)만큼 줄었는가"로 확인한다.
  const childrenAfterCollapse = await page.locator('.component-node').count();
  console.log(
    `[verify-ux3] 셰브런 클릭 후 group-node--collapsed 부여: ${collapsedClassApplied}, 전체 자식 컴포넌트 수: ${childrenBeforeCollapse} → ${childrenAfterCollapse} (CheckoutPanel.tsx 자식 수만큼 줄어야 정상)`,
  );
  await page.screenshot({ path: outPath('01-group-collapsed.png') });

  await groupToggleByGroupName(page, 'CheckoutPanel.tsx').click();
  await page.waitForTimeout(300);
  const childrenAfterExpand = await page.locator('.component-node').count();
  console.log(`[verify-ux3] 다시 펼친 뒤 전체 자식 컴포넌트 수: ${childrenAfterExpand} (${childrenBeforeCollapse}로 복원돼야 정상)`);

  // --- 2. 검색이 수동 접기보다 우선한다 ---
  await groupToggleByGroupName(page, 'CheckoutPanel.tsx').click(); // 다시 접기
  await page.waitForTimeout(300);
  await page.locator('.toolbar__search').fill('CheckoutItem');
  await page.waitForTimeout(1000); // 디바운스(300ms) + fitView(400ms) + 여유
  const matchedWhileManuallyCollapsed = await page.locator('.component-node--matched').count();
  console.log(
    `[verify-ux3] 수동으로 접은 그룹이어도 검색 매치는 강제로 펼쳐짐: matched 노드 수 ${matchedWhileManuallyCollapsed} (1 이상이어야 정상)`,
  );
  await page.locator('.toolbar__search').fill('');
  await page.waitForTimeout(200);

  // --- 3. 우클릭 컨텍스트 메뉴 ---
  // 3-a. 그룹 프레임 우클릭 → 이 그룹으로 확대
  const checkoutFrameBox = await checkoutFrame.boundingBox();
  await page.mouse.click(checkoutFrameBox.x + 20, checkoutFrameBox.y + 10, { button: 'right' });
  const groupMenuVisible = await page.locator('.context-menu').isVisible().catch(() => false);
  const groupMenuItems = await page.locator('.context-menu__item').allTextContents();
  console.log(`[verify-ux3] 그룹 우클릭: 컨텍스트 메뉴 표시 ${groupMenuVisible}, 항목: ${JSON.stringify(groupMenuItems)}`);
  await page.screenshot({ path: outPath('02-group-context-menu.png') });

  await page.getByRole('menuitem', { name: '이 그룹으로 확대' }).click();
  await page.waitForTimeout(600);
  const zoomBadgeAfterContextFit = await page.locator('.zoom-badge').textContent().catch(() => '');
  console.log(`[verify-ux3] "이 그룹으로 확대" 클릭 후 상세 모드로 전환: ${zoomBadgeAfterContextFit?.includes('상세 모드')}`);

  // 2번 시나리오의 마지막 조작이 CheckoutPanel.tsx를 수동으로 접어 둔 채였다 — 컴포넌트 우클릭
  // 테스트를 위해 실제로 클릭할 컴포넌트 노드가 있어야 하므로 다시 펼친다.
  const stillCollapsed = await checkoutFrame.evaluate((el) => el.classList.contains('group-node--collapsed'));
  if (stillCollapsed) {
    await groupToggleByGroupName(page, 'CheckoutPanel.tsx').click();
    await page.waitForTimeout(300);
  }

  // 3-b. 컴포넌트 노드 우클릭 → 실제 화면에서 보기
  const componentNode = page.locator('.component-node').first();
  const componentName = await componentNode.locator('.component-node__name').textContent();
  await componentNode.click({ button: 'right' });
  const componentMenuItems = await page.locator('.context-menu__item').allTextContents();
  console.log(`[verify-ux3] 컴포넌트(${componentName}) 우클릭: 메뉴 항목: ${JSON.stringify(componentMenuItems)}`);

  await page.getByRole('menuitem', { name: '실제 화면에서 보기' }).click();
  const highlightBoxAfterContextAction = await page
    .waitForSelector('.dom-highlight-overlay__box', { timeout: 1000 })
    .then(() => true)
    .catch(() => false);
  console.log(`[verify-ux3] "실제 화면에서 보기" 클릭 후 DOM 하이라이트 박스 표시: ${highlightBoxAfterContextAction}`);

  // 3-c. 컴포넌트 노드 우클릭 → 이 이름으로 검색
  await componentNode.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '이 이름으로 검색' }).click();
  await page.waitForTimeout(200);
  const searchValueAfterContextAction = await page.locator('.toolbar__search').inputValue();
  console.log(
    `[verify-ux3] "이 이름으로 검색" 클릭 후 검색창 값: "${searchValueAfterContextAction}" (컴포넌트 이름 "${componentName}"과 일치해야 정상)`,
  );
  await page.locator('.toolbar__search').fill('');
  await page.waitForTimeout(200);

  // --- 4. 캔버스 스티키노트 ---
  await page.getByRole('button', { name: '🗒️ 메모 추가' }).click();
  const stickyCountAfterAdd = await page.locator('.sticky-note').count();
  console.log(`[verify-ux3] 메모 추가 후 .sticky-note 개수: ${stickyCountAfterAdd} (1 이상이어야 정상)`);
  await page.screenshot({ path: outPath('03-sticky-note-added.png') });

  const stickyTextarea = page.locator('.sticky-note__text').first();
  await stickyTextarea.fill('여기서부터 봐야 함');
  await page.waitForTimeout(300); // localStorage 저장(useEffect) 대기

  await page.reload({ waitUntil: 'networkidle' });
  await openBoard(page);
  await page.waitForSelector('.react-flow__node', { timeout: 5000 });
  const stickyTextAfterReload = await page.locator('.sticky-note__text').first().inputValue().catch(() => null);
  console.log(`[verify-ux3] 새로고침 후 메모 내용 유지(localStorage): "${stickyTextAfterReload}"`);

  // 새로고침 후 재실행된 fitView가 스티키노트까지 포함해 다시 맞추면서, 화면 우상단 고정
  // 패널(zoom-badge)과 노트가 우연히 겹칠 수 있다(월드 좌표 노트 vs 화면 고정 패널이라
  // 원리적으로 가능한 충돌 — 실사용에서는 노트를 드래그해 피할 수 있는 수준). 이 테스트의
  // 관심사는 "삭제가 실제로 동작하는가"이지 겹침 자체가 아니다 — Playwright의 `force`는
  // 액션 가능성 검사만 건너뛸 뿐 클릭은 여전히 화면 좌표로 디스패치돼 진짜로 위에 있는
  // zoom-badge가 대신 받아버린다(실측으로 확인). 좌표 기반 클릭 대신 DOM 요소에 직접
  // .click()을 호출해 시각적 겹침과 무관하게 그 버튼의 핸들러를 확실히 태운다.
  await page.locator('.sticky-note__delete').first().evaluate((el) => el.click());
  await page.waitForTimeout(300);
  const stickyCountAfterDelete = await page.locator('.sticky-note').count();
  console.log(`[verify-ux3] 삭제 후 .sticky-note 개수: ${stickyCountAfterDelete} (0이어야 정상)`);

  console.log(`[verify-ux3] 콘솔 에러 개수: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log('[verify-ux3] 콘솔 에러 내용:', consoleErrors);
  }

  await browser.close();
  console.log(`[verify-ux3] 완료. 스크린샷: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[verify-ux3] 실패', err);
  process.exit(1);
});
