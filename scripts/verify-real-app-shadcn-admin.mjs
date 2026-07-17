// 판단 지점 검증: 라이브 MVP를 우리가 만들지 않은 실제 오픈소스 앱(shadcn-admin, TanStack Router +
// Radix UI 기반 어드민 템플릿)에 붙인 뒤, excalidraw(646 fiber, ADR-0009/0012)보다 훨씬 큰
// "수천 개 컴포넌트" 규모에서 그룹핑/캔버스 규모/레이아웃 재계산 성능이 어떻게 되는지 확인한다.
// scripts/verify-real-app.mjs(excalidraw 크로스체크)를 그대로 복제해 상호작용만 바꿨다 —
// excalidraw는 사각형/원 도구 드래그였지만 shadcn-admin은 그리기 캔버스가 없으므로,
// /tasks 데이터 테이블의 검색창에 타이핑하는 것으로 반복 커밋을 유발한다(각 키 입력마다
// 필터링된 행 목록으로 테이블 전체가 리렌더된다).
//
// 사전 준비 (재현 방법):
//   experiments/real-app-validation/shadcn-admin/ 에 satnaing/shadcn-admin을 clone하고,
//   package.json에 bippy + @xyflow/react를 추가한 뒤, src/_react-render-board/ 에 이 레포의
//   src/{hooking,data,visualization}를 복사하고, src/main.tsx에서 root.render() 직후
//   mountReactRenderBoard(rootElement)를 호출하도록 두 줄을 추가한다. 또한 데이터가 많은 상태로
//   몰아넣기 위해 src/features/tasks/data/tasks.ts의 mock 행 개수를 100 -> 500으로 늘렸다
//   (users.ts는 원래부터 500행). /tasks?pageSize=500, /users?pageSize=500 URL로 페이지네이션을
//   해제해 전체 행을 한 번에 마운트한다.
//   그 상태로 dev 서버를 띄운 뒤: BASE_URL=http://localhost:5192 node scripts/verify-real-app-shadcn-admin.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5192';
const OUT_DIR = fileURLToPath(new URL('../verify-output/real-app-shadcn-admin/', import.meta.url));
const outPath = (name) => path.join(OUT_DIR, name);

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.setDefaultTimeout(60000);

  const consoleErrors = [];
  let maxDepthWarnCount = 0;
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.text().includes('MAX_DEPTH')) maxDepthWarnCount++;
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  // /users 테이블: mock 500행 중 pageSize=100으로 100행을 한 번에 마운트 — 사전 탐색 결과
  // (아래 참고) pageSize=100 부근에서 이미 8000+ 총 fiber(호스트+composite)에 도달하고,
  // 그 이상(200~500)으로 올려도 serializeFiberTree의 MAX_DEPTH(200) 캡이 형제(sibling)
  // 순회에서도 depth를 증가시키는 방식이라 실질적으로 더 늘지 않고(오히려 트리 순회가
  // 조기 중단되어 경고만 급증) 반응성만 나빠진다(500행에서는 보드를 여는 데만 30초+
  // 걸림 — 아래 "관찰" 섹션 참고). 100행이 "충분히 큰 데이터 상태로 몰아넣기"와
  // "그래도 상호작용 가능한 상태" 사이의 실용적 지점이다.
  await page.goto(`${BASE_URL}/users?pageSize=100`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: outPath('01-users-table-loaded.png') });

  const searchInput = page.getByPlaceholder(/Filter users/i).first();
  const hasSearch = await searchInput.count();
  console.log('[verify-real-app-shadcn-admin] users 검색창 존재:', hasSearch > 0);

  // 레이아웃 재계산 성능 비교의 기준선: 보드를 열기 "전"(= 계측은 동작하지만 Canvas가 마운트되지
  // 않아 normalizeForCanvas/toFlow가 전혀 실행되지 않는 상태)에 검색창에 5글자를 입력해 걸리는
  // 시간을 잰다(각 keypress마다 100행 테이블 전체가 필터링/리렌더된다 — excalidraw의
  // drawFiveCircles와 동일한 방법론, ADR-0009가 433ms/1196ms로 비교했던 것과 동일).
  //
  // 보드가 열리면 BoardOverlay가 position:fixed; inset:0 으로 화면 전체를 덮어(excalidraw
  // 통합의 mount.tsx와 동일한 구조) 클릭 기반 조작(locator.click/fill)이 더 이상 검색창에
  // 닿지 못한다. 포커스는 hit-test 없이도 옮길 수 있고(.focus()), 키보드 이벤트는 topmost
  // 엘리먼트가 아니라 document.activeElement로 가므로, 클릭 대신 focus() + keyboard.type을
  // 써서 "보드 열림/닫힘" 두 상태에서 동일한 경로로 상호작용을 재현한다.
  async function typeAndClear(text) {
    await searchInput.focus();
    const t0 = Date.now();
    await page.keyboard.type(text, { delay: 0 });
    const ms = Date.now() - t0;
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    return ms;
  }

  const typeMsOverlayClosed = await typeAndClear('admin');
  console.log(`[verify-real-app-shadcn-admin] 오버레이를 "닫은 채로" 검색어 5글자 입력 소요 시간: ${typeMsOverlayClosed}ms (기준선 — Canvas가 마운트되지 않아 레이아웃 재계산 자체가 실행되지 않음)`);
  await page.waitForTimeout(300);

  const overlayButton = page.getByRole('button', { name: /render-board/ });
  const hasButton = await overlayButton.count();
  console.log('[verify-real-app-shadcn-admin] 오버레이 토글 버튼 존재:', hasButton > 0);
  if (hasButton === 0) {
    console.error('[verify-real-app-shadcn-admin] 실패: 오버레이 버튼을 찾을 수 없음');
    await browser.close();
    process.exit(1);
  }

  await overlayButton.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: outPath('02-board-opened-initial.png') });

  let nodeCount = await page.locator('.react-flow__node').count();
  console.log('[verify-real-app-shadcn-admin] 초기 오픈 시 DOM에 실제 렌더된 .react-flow__node 수(onlyRenderVisibleElements로 뷰포트 내부만):', nodeCount);
  const toolbarText = await page.locator('.toolbar__count').textContent().catch(() => 'N/A');
  console.log('[verify-real-app-shadcn-admin] 툴바 표시 카운트(진짜 총합 — visible/total, host 제외 기준):', toolbarText);

  // groupHint 비동기 해석 대기 (ADR-0007) — 실제 앱은 컴포넌트 수가 많아 exp보다 더 걸릴 수 있다.
  await page.waitForTimeout(2000);
  const pendingCount = await page.locator('text=그룹 확인 중').count();
  console.log('[verify-real-app-shadcn-admin] groupHint 해석 후 남은 pending 그룹 라벨 수:', pendingCount);

  const groupLabels = await page.locator('.group-node__label').allTextContents();
  console.log('[verify-real-app-shadcn-admin] 그룹(파일) 라벨 목록 —', groupLabels.length, '개:');
  console.log(groupLabels.map((g) => `  - ${g}`).join('\n'));

  await page.screenshot({ path: outPath('03-board-after-grouphint-mapmode.png') });

  // fitView 이후 자동 줌 레벨에서 semantic zoom 배지 확인 (지도 모드 — 그룹 프레임만 보이는지).
  const zoomBadge = await page.locator('.zoom-badge').textContent().catch(() => null);
  console.log('[verify-real-app-shadcn-admin] 줌 배지:', zoomBadge);

  // 상세 모드 확인: 특정 그룹까지 줌인해서 개별 노드 라벨이 겹치지 않고 읽히는지,
  // memo/forwardRef(Radix 컴포넌트)가 "(anonymous)"로 뭉개지지 않고 실제 이름이 나오는지 확인.
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, -120); // wheel up = zoom in
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: outPath('03b-board-detail-zoom.png') });
  const anonymousCount = await page.locator('.component-node--anonymous').count();
  console.log('[verify-real-app-shadcn-admin] 상세 모드에서 "(anonymous)" 표시된 노드 수:', anonymousCount);

  // host 노드 토글 스트레스 테스트: 전체(호스트 포함)를 켰을 때 캔버스가 버티는지.
  // shadcn-admin 자체에도 테이블 select-all/행 체크박스가 있어 #rrb-board-host로 스코프를
  // 좁혀 보드 자신의 체크박스만 선택한다.
  const hostToggle = page.locator('#rrb-board-host').getByRole('checkbox');
  const tHost0 = Date.now();
  await hostToggle.check({ force: true });
  await page.waitForTimeout(800);
  const hostToggleMs = Date.now() - tHost0;
  const totalWithHost = await page.locator('.react-flow__node').count();
  console.log(`[verify-real-app-shadcn-admin] host 노드 포함 토글 반영 시간: ${hostToggleMs}ms, 총 노드 수: ${totalWithHost}`);
  await page.screenshot({ path: outPath('05-board-with-host-nodes.png') });
  await hostToggle.uncheck({ force: true });
  await page.waitForTimeout(400);

  // 레이아웃 재계산 성능: 오버레이를 "연 채로" 검색창을 조작해 매 커밋마다 실제로
  // 레이아웃이 재계산되는 최악의 경우를 측정한다 (사용자 지시사항의 핵심 검증 항목).
  const typeMsOverlayOpen = await typeAndClear('admin');
  const ratio = (typeMsOverlayOpen / typeMsOverlayClosed).toFixed(2);
  console.log(`[verify-real-app-shadcn-admin] 오버레이를 "연 채로" 검색어 5글자 입력 소요 시간: ${typeMsOverlayOpen}ms (닫았을 때 ${typeMsOverlayClosed}ms 대비 ${ratio}배 — 매 커밋마다 보드 레이아웃도 같이 재계산됨)`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: outPath('06-board-overlay-open-during-typing.png') });

  const nodeCountAfter = await page.locator('.react-flow__node').count();
  console.log('[verify-real-app-shadcn-admin] 추가 상호작용 후 노드 수:', nodeCountAfter, '(초기', nodeCount, '대비 변화 확인용)');

  console.log('[verify-real-app-shadcn-admin] 콘솔/페이지 에러 개수:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.log('[verify-real-app-shadcn-admin] 에러 내용 (최대 20개):', consoleErrors.slice(0, 20));
  }
  console.log('[verify-real-app-shadcn-admin] MAX_DEPTH(200) 순회 중단 경고 횟수(형제 노드 순회도 depth를 증가시키는 구조라 넓은 sibling 리스트에서 조기 절단됨 — data/serialize.ts):', maxDepthWarnCount);

  await browser.close();
  console.log(`[verify-real-app-shadcn-admin] 완료. 스크린샷: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[verify-real-app-shadcn-admin] 실패', err);
  process.exit(1);
});
