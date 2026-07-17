// 판단 지점 검증: 라이브 MVP를 우리가 만들지 않은 실제 오픈소스 앱(excalidraw)에 붙인 뒤
// 그룹핑 힌트 품질·캔버스 규모·레이아웃 재계산 성능·memo/forwardRef/lazy/portal 처리를 확인한다.
// (ADR-0009 참고. 자체 fixture 스모크 테스트는 scripts/verify.mjs — 이건 그 필요조건을
// 충족한 뒤 통과해야 하는 충분조건 검증이다.)
//
// 사전 준비 (재현 방법):
//   experiments/real-app-validation/excalidraw/ 에 excalidraw를 clone하고,
//   excalidraw-app 워크스페이스에 bippy + @xyflow/react를 추가한 뒤,
//   excalidraw-app/_react-render-board/ 에 이 레포의 src/{hooking,data,visualization}를
//   복사하고, excalidraw-app/index.tsx에서 mountReactRenderBoard(rootElement)를 호출하도록
//   두 줄을 추가한다 (ADR-0009에 정확한 절차 기록).
//   그 상태로 dev 서버를 띄운 뒤: BASE_URL=http://localhost:5190 node scripts/verify-real-app.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5190';
const OUT_DIR = fileURLToPath(new URL('../verify-output/real-app/', import.meta.url));
const outPath = (name) => path.join(OUT_DIR, name);

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: outPath('01-excalidraw-loaded.png') });

  // 오버레이 열기 전에 먼저 excalidraw를 실제로 상호작용시켜 커밋을 여러 번 유발한다
  // (도형 생성 = 사이드패널/속성 패널이 열리며 실제 composite 컴포넌트가 마운트된다).
  const canvas = page.locator('canvas.excalidraw__canvas--interactive, canvas').first();
  const box = await canvas.boundingBox();
  if (box) {
    // 사각형 도구 선택 후 도형 3개 드래그로 생성 — 각각 커밋을 유발.
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('r'); // 사각형 도구 단축키
      const x = box.x + 100 + i * 140;
      const y = box.y + 100;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 100, y + 80, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(150);
    }
  }
  await page.waitForTimeout(300);
  console.log('[verify-real-app] 도형 3개 생성 완료 (속성 패널 등 실제 UI 커밋 유발)');

  // 레이아웃 재계산 성능 비교의 기준선: 보드를 열기 "전"(= 계측은 동작하지만 Canvas가 마운트되지
  // 않아 normalizeForCanvas/toFlow가 전혀 실행되지 않는 상태)에 같은 상호작용(도형 5개, 원 도구)을
  // 그려 걸리는 시간을 잰다. 이후 오버레이를 연 상태에서 동일한 상호작용을 다시 재서 배율을 낸다
  // (ADR-0009가 433ms/1196ms로 비교했던 것과 동일한 방법론 — 이번엔 같은 세션/기기에서 전후 비교).
  async function drawFiveCircles() {
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('o'); // 원 도구
      const x = box.x + 400 + i * 60;
      const y = box.y + 300;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 50, y + 50, { steps: 3 });
      await page.mouse.up();
    }
    return Date.now() - t0;
  }

  const drawMsOverlayClosed = await drawFiveCircles();
  console.log(`[verify-real-app] 오버레이를 "닫은 채로" 도형 5개 생성 소요 시간: ${drawMsOverlayClosed}ms (기준선 — Canvas가 마운트되지 않아 레이아웃 재계산 자체가 실행되지 않음)`);
  await page.waitForTimeout(300);

  const overlayButton = page.getByRole('button', { name: /render-board/ });
  const hasButton = await overlayButton.count();
  console.log('[verify-real-app] 오버레이 토글 버튼 존재:', hasButton > 0);
  if (hasButton === 0) {
    console.error('[verify-real-app] 실패: 오버레이 버튼을 찾을 수 없음');
    await browser.close();
    process.exit(1);
  }

  await overlayButton.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: outPath('02-board-opened-initial.png') });

  let nodeCount = await page.locator('.react-flow__node').count();
  console.log('[verify-real-app] 초기 오픈 시 React Flow 노드 수(그룹+컴포넌트 합계):', nodeCount);

  // groupHint 비동기 해석 대기 (ADR-0007) — 실제 앱은 컴포넌트 수가 많아 exp보다 더 걸릴 수 있다.
  await page.waitForTimeout(1500);
  const pendingCount = await page.locator('text=그룹 확인 중').count();
  console.log('[verify-real-app] groupHint 해석 후 남은 pending 그룹 라벨 수:', pendingCount);

  const groupLabels = await page.locator('.group-node__label').allTextContents();
  console.log('[verify-real-app] 그룹(파일) 라벨 목록 —', groupLabels.length, '개:');
  console.log(groupLabels.map((g) => `  - ${g}`).join('\n'));

  await page.screenshot({ path: outPath('03-board-after-grouphint.png') });

  // fitView 이후 자동 줌 레벨에서 semantic zoom 배지 확인.
  const zoomBadge = await page.locator('.zoom-badge').textContent().catch(() => null);
  console.log('[verify-real-app] 줌 배지:', zoomBadge);

  // 상세 모드 확인: 특정 그룹까지 줌인해서 개별 노드 라벨이 겹치지 않고 읽히는지,
  // memo/forwardRef(Radix 컴포넌트)가 "(anonymous)"로 뭉개지지 않고 실제 이름이 나오는지 확인.
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, -120); // wheel up = zoom in
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: outPath('03b-board-detail-zoom.png') });
  const anonymousCount = await page.locator('.component-node--anonymous').count();
  console.log('[verify-real-app] 상세 모드에서 "(anonymous)" 표시된 노드 수:', anonymousCount);

  // host 노드 토글 스트레스 테스트: 646개 전체(호스트 포함)를 켰을 때 캔버스가 버티는지.
  const hostToggle = page.getByRole('checkbox');
  const tHost0 = Date.now();
  await hostToggle.check();
  await page.waitForTimeout(500);
  const hostToggleMs = Date.now() - tHost0;
  const totalWithHost = await page.locator('.react-flow__node').count();
  console.log(`[verify-real-app] host 노드 포함 토글 반영 시간: ${hostToggleMs}ms, 총 노드 수: ${totalWithHost}`);
  await page.screenshot({ path: outPath('05-board-with-host-nodes.png') });
  await hostToggle.uncheck();
  await page.waitForTimeout(400);

  // 레이아웃 재계산 성능: 오버레이를 "연 채로" 캔버스를 조작해 매 커밋마다 실제로
  // 레이아웃이 재계산되는 최악의 경우를 측정한다 (사용자 지시사항의 핵심 검증 항목).
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const drawMsOverlayOpen = await drawFiveCircles();
  const ratio = (drawMsOverlayOpen / drawMsOverlayClosed).toFixed(2);
  console.log(`[verify-real-app] 오버레이를 "연 채로" 도형 5개 추가 생성 소요 시간: ${drawMsOverlayOpen}ms (닫았을 때 ${drawMsOverlayClosed}ms 대비 ${ratio}배 — 매 커밋마다 보드 레이아웃도 같이 재계산됨)`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: outPath('06-board-overlay-open-during-drawing.png') });

  const nodeCountAfter = await page.locator('.react-flow__node').count();
  console.log('[verify-real-app] 추가 상호작용 후 노드 수:', nodeCountAfter, '(초기', nodeCount, '대비 변화 확인용)');

  console.log('[verify-real-app] 콘솔/페이지 에러 개수:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.log('[verify-real-app] 에러 내용 (최대 20개):', consoleErrors.slice(0, 20));
  }

  await browser.close();
  console.log(`[verify-real-app] 완료. 스크린샷: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[verify-real-app] 실패', err);
  process.exit(1);
});
