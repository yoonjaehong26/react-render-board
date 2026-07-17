// 노드 수 스케일링 스트레스 테스트 (라이브 MVP, 실제 훅킹 파이프라인).
//
// scripts/verify-stress-scale.mjs가 exp2(합성 JSON, 훅킹 없음)로 순수 캔버스/레이아웃
// 성능만 봤다면, 이 스크립트는 src/fixtures/domains/stress/StressGrid.tsx로 실제 composite
// Fiber 수천 개를 마운트하고 진짜 훅킹 파이프라인(fiberInspector -> serializeFiberTree ->
// RenderStore)을 태워, ADR-0012가 646개 노드(excalidraw)에서 측정한 "보드 열림/닫힘"
// 응답 배율(1.6~1.77배)이 노드 수가 늘어날수록(2,000 / 5,000) 어떻게 변하는지 잰다.
//
// 핵심 배경(src/data/store.ts 참고): ADR-0012의 requestIdleCallback 디바운스는 구독자
// notify()만 커밋 프레임과 분리했을 뿐, handleCommit 맨 앞의 serializeFiberTree(전체 트리
// 순회, O(노드 수))는 매 커밋마다 동기로 실행된다 — board on/off 여부와 무관하게. 즉 이
// 비용은 board 열림/닫힘 "배율"의 분자·분모 모두에 공통으로 깔리는 비용이라, 노드 수가
// 늘어나면 절대 응답 시간(닫힘 기준선 포함)은 늘어나되, 배율 자체는 오히려 희석되어
// 줄어들 수도 있다 — 실측으로 확인한다(이론만으로 단정하지 않는다).
//
// 측정 방법론은 ADR-0009/0012/0013과 동일: 같은 상호작용(Counter 버튼 10회 연타)을
// board=on / board=off 두 URL에서 각각 REPEATS회 반복해 중앙값을 비교한다.
//
// 실행 방법:
//   npm run dev -- --port 5197 &
//   BASE_URL=http://localhost:5197 node scripts/verify-stress-scale-live.mjs
import { chromium } from 'playwright';
import { openBoard } from './lib/openBoard.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5197';
// 646/1000은 ADR-0009/0012(excalidraw 실측)·ADR-0014(1,000-스트레스 실측)와 같은 자리에서
// 비교할 수 있도록 추가했다(ADR-0016 ② 검증) — 0/2000/5000은 기존 그대로.
const STRESS_COUNTS = [0, 646, 1000, 2000, 5000];
const CLICKS = 10;
const REPEATS = Number(process.env.REPEATS ?? 5);

function median(nums) {
  const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (xs.length === 0) return NaN;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
}

function fmt(n, digits = 1) {
  return Number.isFinite(n) ? n.toFixed(digits) : 'n/a';
}

async function measureClicks(page) {
  const counterButton = page.getByRole('button', { name: /^count is/ });
  const t0 = Date.now();
  for (let i = 0; i < CLICKS; i++) {
    await counterButton.click();
  }
  return Date.now() - t0;
}

async function measureScenario(browser, stressCount, boardOn) {
  const params = new URLSearchParams();
  if (stressCount > 0) params.set('stressCount', String(stressCount));
  if (!boardOn) params.set('board', 'off');
  const url = `${BASE_URL}${params.toString() ? '?' + params.toString() : ''}`;

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  if (stressCount > 0) {
    await page.waitForSelector('[data-testid="stress-grid"]', { timeout: 30000 });
  }
  // board=on일 때만 존재하는 플로팅 버튼으로 실제로 보드를 열어야 Canvas가 렌더링되고
  // layout/toFlow 비용이 발생한다(ADR-0020/0024/0025 셸 변경) — 안 열면 이 시나리오가
  // board=off와 같은 비용만 재는 셈이 되어 이 스크립트의 측정 목적 자체가 깨진다.
  if (boardOn) {
    await openBoard(page);
    await page.waitForSelector('.toolbar__count', { timeout: 30000 });
  }
  // 초기 커밋 + groupHint 비동기 해석까지 안정화될 시간을 준다(노드 수가 클수록 더 걸린다).
  await page.waitForTimeout(1000 + stressCount / 2);

  let nodeCountText = null;
  if (boardOn) {
    nodeCountText = await page.locator('.toolbar__count').last().textContent().catch(() => null);
  }

  const runs = [];
  for (let i = 0; i < REPEATS; i++) {
    runs.push(await measureClicks(page));
  }
  const clickMs = median(runs);

  await page.close();
  return { stressCount, boardOn, clickMs, clickRuns: runs, nodeCountText, consoleErrors };
}

async function main() {
  const browser = await chromium.launch();
  const results = [];

  for (const stressCount of STRESS_COUNTS) {
    for (const boardOn of [false, true]) {
      const r = await measureScenario(browser, stressCount, boardOn);
      results.push(r);
      console.log(
        `[stress-live] stressCount=${String(stressCount).padStart(4)} board=${boardOn ? 'on ' : 'off'} | ` +
          `Counter ${CLICKS}회 클릭 중앙값=${String(Math.round(r.clickMs)).padStart(4)}ms [${r.clickRuns.map(Math.round).join(',')}] ` +
          (r.nodeCountText ? `| 캔버스: ${r.nodeCountText}` : ''),
      );
      if (r.consoleErrors.length > 0) {
        console.log(`[stress-live]   콘솔/페이지 에러 ${r.consoleErrors.length}건:`, r.consoleErrors.slice(0, 5));
      }
    }
  }

  console.log('\n[stress-live] === 응답 배율 (board on / board off) — ADR-0012 기준선: 646개 노드에서 1.6~1.77배 ===');
  const table = [];
  for (const stressCount of STRESS_COUNTS) {
    const on = results.find((r) => r.stressCount === stressCount && r.boardOn);
    const off = results.find((r) => r.stressCount === stressCount && !r.boardOn);
    const ratio = on && off && off.clickMs > 0 ? on.clickMs / off.clickMs : NaN;
    table.push({
      stressCount,
      '닫힘(ms)': Math.round(off.clickMs),
      '열림(ms)': Math.round(on.clickMs),
      배율: fmt(ratio, 2) + '배',
      캔버스노드: on.nodeCountText ?? 'n/a',
    });
  }
  console.table(table);

  await browser.close();
  console.log('[stress-live] 완료.');
}

main().catch((err) => {
  console.error('[stress-live] 실패', err);
  process.exit(1);
});
