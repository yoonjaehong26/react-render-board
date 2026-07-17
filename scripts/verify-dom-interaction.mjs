// ADR-0024/0025 검증 스크립트 — 보드 ↔ 실제 DOM 양방향 인터랙션.
// 라이브 MVP를 dev 서버로 띄운 상태에서 실행한다:
//   npm run dev -- --port 5187 &
//   BASE_URL=http://localhost:5187 node scripts/verify-dom-interaction.mjs
//
// 확인하는 것:
// 1. 정방향 — 도킹 패널(ADR-0025)을 연 상태에서 컴포넌트 노드를 클릭하면: 대응하는 실제 DOM
//    요소 위에 하이라이트 박스(.dom-highlight-overlay__box)가 나타났다가 일정 시간 뒤
//    사라진다. 패널은 도킹 모델이라 닫히지 않는다(전체화면이었던 초기 설계와 다름).
// 2. 평소 클릭(Alt 없음, 요소 선택 모드 꺼짐)은 역방향 인터랙션을 전혀 건드리지 않는다 —
//    이게 원래 버그였다: 첫 구현은 모든 클릭에 반응해 "항목 추가" 같은 평범한 조작마다
//    보드가 그 버튼으로 확대돼 버렸다(scripts/verify.mjs가 처음 잡아냄). 실제 앱 자신의
//    클릭 핸들러(여기서는 알림 패널 토글)는 평소처럼 정상 실행돼야 한다.
// 3. 역방향 — Alt(⌥)+클릭은 명시적 "요소 선택" 신호로 취급되어: 보드가 자동으로 열리고,
//    대응 노드가 강조 스타일(.component-node--highlighted)로 나타나며, 클릭한 DOM 요소에도
//    하이라이트 박스가 뜬다. 이때는 대상 앱 자신의 클릭 핸들러는 실행되지 않는다(캡처 단계
//    가로채기, domInteraction.ts) — 알림 패널 토글 상태가 안 바뀌는 것으로 확인한다.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openBoard } from './lib/openBoard.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5187';
const OUT_DIR = fileURLToPath(new URL('../verify-output/dom-interaction/', import.meta.url));
const outPath = (name) => path.join(OUT_DIR, name);
// src/visualization/lib/interactionStore.ts의 HIGHLIGHT_DURATION_MS와 맞춰 둔다 — 이 스크립트는
// 순수 .mjs라 TS 소스를 직접 import할 수 없어 값을 여기 복제한다.
const HIGHLIGHT_DURATION_MS = 1600;

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

  // --- 1. 정방향: 보드 노드 클릭 → DOM 하이라이트 (도킹 패널이라 보드는 안 닫힘) ---
  await openBoard(page);
  await page.waitForSelector('.react-flow__node', { timeout: 5000 });
  await page.waitForTimeout(600); // groupHint 비동기 해석 대기

  await zoomIntoGroup(page, 'AppShell.tsx');
  const componentNode = page.locator('.component-node').first();
  await componentNode.waitFor({ state: 'visible', timeout: 5000 });
  const clickedName = await componentNode.locator('.component-node__name').textContent();
  await componentNode.click();

  const highlightBoxAfterForwardClick = await page
    .waitForSelector('.dom-highlight-overlay__box', { timeout: 1000 })
    .then(() => true)
    .catch(() => false);
  console.log(`[verify-dom] 정방향: 노드(${clickedName}) 클릭 직후 DOM 하이라이트 박스 표시: ${highlightBoxAfterForwardClick}`);

  const panelStillDockedAfterForwardClick = (await page.locator('.board-panel').count()) > 0;
  console.log(`[verify-dom] 정방향: 클릭 후에도 도킹 패널이 계속 열려 있음(전체화면이 아니므로 닫을 필요 없음): ${panelStillDockedAfterForwardClick}`);
  await page.screenshot({ path: outPath('01-forward-click-highlight.png') });

  await page.waitForTimeout(HIGHLIGHT_DURATION_MS + 200);
  const highlightGoneAfterTimeout = (await page.locator('.dom-highlight-overlay__box').count()) === 0;
  console.log(`[verify-dom] 정방향: ${HIGHLIGHT_DURATION_MS}ms 뒤 하이라이트 자동 소멸: ${highlightGoneAfterTimeout}`);

  // 다음 단계(역방향)를 보드 닫힌 상태에서 시작하기 위해 수동으로 닫는다.
  await page.getByRole('button', { name: 'render-board 닫기' }).click();
  await page.waitForTimeout(200);

  // --- 2. 평소 클릭(Alt 없음, 픽 모드 꺼짐) — 역방향에 전혀 관여하지 않아야 한다 ---
  // 원래 버그: 모든 클릭에 반응해 "항목 추가" 같은 평범한 조작마다 보드가 열리며 그 버튼으로
  // 확대돼 버렸다(scripts/verify.mjs가 발견). 지금은 Alt+클릭/픽 모드가 아니면 완전히 무관해야 한다.
  const toggleButton = page.getByRole('button', { name: '알림 패널 보이기' });
  await toggleButton.click();

  const boardStayedClosedOnPlainClick = (await page.locator('.board-panel').count()) === 0;
  console.log(`[verify-dom] 평소 클릭: 보드가 계속 닫혀 있음(역방향 미개입): ${boardStayedClosedOnPlainClick}`);

  const panelToggledByPlainClick = await page
    .getByRole('button', { name: '알림 패널 숨기기' })
    .count()
    .then((n) => n > 0)
    .catch(() => false);
  console.log(`[verify-dom] 평소 클릭: 앱 자신의 클릭 핸들러(패널 토글)는 정상 실행됨: ${panelToggledByPlainClick}`);

  // 원상복구 — 다시 클릭해 패널을 닫아 둔다(다음 단계와 상태 간섭 방지).
  await page.getByRole('button', { name: '알림 패널 숨기기' }).click();
  await page.waitForTimeout(200);

  // --- 3. 역방향: Alt(⌥)+클릭 — 명시적 요소 선택 ---
  const toggleButtonAfterReset = page.getByRole('button', { name: '알림 패널 보이기' });
  await toggleButtonAfterReset.click({ modifiers: ['Alt'] });

  const boardOpenedAfterAltClick = await page
    .waitForSelector('.board-panel', { timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  console.log(`[verify-dom] 역방향(Alt+클릭): 보드가 자동으로 열림: ${boardOpenedAfterAltClick}`);

  const panelNotToggledByAltClick = (await page.getByRole('button', { name: '알림 패널 숨기기' }).count()) === 0;
  console.log(`[verify-dom] 역방향(Alt+클릭): 앱 자신의 클릭 핸들러(패널 토글)는 캡처 단계에서 막힘: ${panelNotToggledByAltClick}`);

  await page.waitForTimeout(600); // fitView 전환 애니메이션(400ms) 대기
  const highlightedNodeCount = await page.locator('.component-node--highlighted').count();
  console.log(`[verify-dom] 역방향(Alt+클릭): 보드 안에서 강조 표시된 노드 수: ${highlightedNodeCount} (1 이상이어야 정상)`);

  const highlightBoxAfterAltClick = await page.locator('.dom-highlight-overlay__box').count();
  console.log(`[verify-dom] 역방향(Alt+클릭): 클릭한 실제 요소에도 하이라이트 박스 표시: ${highlightBoxAfterAltClick > 0}`);
  await page.screenshot({ path: outPath('02-reverse-altclick-navigate.png') });

  // --- 4. "요소 선택" 토글 모드 — Alt 없이도 픽, 성공 후 자동으로 꺼짐 ---
  await page.getByRole('button', { name: 'render-board 닫기' }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: '🎯 요소 선택' }).click();
  const pickModeButtonActive = await page
    .getByRole('button', { name: /요소 선택 중/ })
    .count()
    .then((n) => n > 0);
  console.log(`[verify-dom] 픽 모드: 토글 버튼이 켜진 상태로 바뀜: ${pickModeButtonActive}`);

  await page.getByRole('button', { name: '알림 패널 보이기' }).click(); // Alt 없이, 픽 모드로만
  const boardOpenedByPickMode = await page
    .waitForSelector('.board-panel', { timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  console.log(`[verify-dom] 픽 모드: Alt 없이도 클릭이 역방향으로 처리됨: ${boardOpenedByPickMode}`);

  const pickModeAutoOff = await page
    .getByRole('button', { name: '🎯 요소 선택' })
    .count()
    .then((n) => n > 0);
  console.log(`[verify-dom] 픽 모드: 픽 성공 후 자동으로 꺼짐(1회성): ${pickModeAutoOff}`);

  console.log(`[verify-dom] 콘솔 에러 개수: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log('[verify-dom] 콘솔 에러 내용:', consoleErrors);
  }

  await browser.close();
  console.log(`[verify-dom] 완료. 스크린샷: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[verify-dom] 실패', err);
  process.exit(1);
});
