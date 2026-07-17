// ADR-0010 검증 스크립트 — class 컴포넌트/에러 바운더리/useTransition/Suspense(use())가
// 계측 파이프라인(hooking -> data -> visualization)을 실제로 통과하는지 확인한다.
// 라이브 MVP를 dev 서버로 띄운 상태에서 실행한다:
//   npm run dev -- --port 5185 &
//   BASE_URL=http://localhost:5185 node scripts/verify-advanced-patterns.mjs
//
// 확인하는 것:
// 1. class 컴포넌트(ClassCounter)가 노드로 잡히고, state 업데이트 후에도 캔버스가 정상 갱신되는가.
// 2. 에러 바운더리 하위 트리가 렌더 중 에러를 던졌을 때 콘솔 에러(React 자체가 찍는 것 제외,
//    계측 자체가 던지는 에러)나 캔버스 크래시 없이 fallback 트리로 갱신되는가. 복구 후 원상복구되는가.
// 3. useTransition 중(isPending) 캔버스가 깨지지 않고, 완료 후 노드 수가 정확히 반영되는가.
// 4. Suspense: 초기 로딩(fallback) 상태와 resolve 후 상태가 각각 커밋으로 반영되는가.
//    "다시 로드"로 재-suspend 시켰을 때도 캔버스가 정상 갱신되는가.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5185';
const OUT_DIR = fileURLToPath(new URL('../verify-output/advanced-patterns/', import.meta.url));
const outPath = (name) => path.join(OUT_DIR, name);

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.react-flow__node', { timeout: 5000 });
  await page.waitForTimeout(700); // groupHint 비동기 해석 + suspense 초기 resolve(500ms) 대기

  const nodeCount0 = await page.locator('.react-flow__node').count();
  console.log(`[verify] 초기 마운트(advanced patterns 포함) 후 노드 수: ${nodeCount0}`);
  const groupLabels0 = await page.locator('.group-node__label').allTextContents();
  console.log('[verify] 초기 그룹 라벨들:', groupLabels0);
  await page.screenshot({ path: outPath('01-initial.png') });

  // 1. class 컴포넌트 — state 업데이트
  await page.getByRole('button', { name: 'class 증가' }).click();
  await page.getByRole('button', { name: 'class 증가' }).click();
  await page.waitForTimeout(200);
  const nodeCountAfterClass = await page.locator('.react-flow__node').count();
  console.log(`[verify] class 증가 2회 클릭 후 노드 수: ${nodeCountAfterClass} (구조 변화 없어야 함 = ${nodeCount0}와 동일)`);
  await page.screenshot({ path: outPath('02-after-class-increment.png') });

  // 2. 에러 바운더리 — 에러 유발
  await page.getByRole('button', { name: '에러 유발' }).click();
  await page.waitForTimeout(300);
  const fallbackVisible = await page.getByText('문제가 발생했습니다').count();
  console.log(`[verify] 에러 유발 후 fallback 텍스트 노출 여부: ${fallbackVisible > 0}`);
  const canvasAliveAfterThrow = await page.locator('.react-flow__node').count();
  console.log(`[verify] 에러 유발 후에도 캔버스 노드 수: ${canvasAliveAfterThrow} (0이면 캔버스 붕괴 의심)`);
  await page.screenshot({ path: outPath('03-after-error-thrown.png') });

  // 복구
  await page.getByRole('button', { name: '복구' }).click();
  await page.waitForTimeout(300);
  const recoveredVisible = await page.getByText('정상 렌더 중').count();
  console.log(`[verify] 복구 후 정상 렌더 텍스트 노출 여부: ${recoveredVisible > 0}`);
  await page.screenshot({ path: outPath('04-after-recovery.png') });

  // 3. useTransition — pending 구간 관찰 시도 + 완료 후 노드 수 증가 확인
  const beforeTransitionCount = await page.locator('.react-flow__node').count();
  await page.getByRole('button', { name: '목록 늘리기 (startTransition)' }).click();
  // pending 구간을 최대한 잡아보되, 못 잡아도 실패로 보지 않는다(스케줄링은 타이밍 의존적).
  let sawPending = false;
  for (let i = 0; i < 20; i++) {
    const pendingCount = await page.getByText('transition (pending)').count();
    if (pendingCount > 0) {
      sawPending = true;
      await page.screenshot({ path: outPath('05-transition-pending.png') });
      break;
    }
    await page.waitForTimeout(15);
  }
  console.log(`[verify] transition pending 구간을 스크린샷으로 포착했는가: ${sawPending}`);
  await page.waitForTimeout(1500);
  const afterTransitionCount = await page.locator('.react-flow__node').count();
  console.log(
    `[verify] transition 완료 후 노드 수: ${afterTransitionCount} (증가해야 정상, 이전: ${beforeTransitionCount})`,
  );
  await page.screenshot({ path: outPath('06-after-transition.png') });

  // 4. Suspense — 재-suspend
  const beforeReloadHasData = await page.getByText('ms 후 로드된 데이터').count();
  console.log(`[verify] 재로드 전 데이터 표시 여부: ${beforeReloadHasData > 0}`);
  await page.getByRole('button', { name: '다시 로드' }).click();
  await page.waitForTimeout(50);
  const fallbackDuringReload = await page.getByText('로딩 중').count();
  console.log(`[verify] 재로드 직후(50ms) fallback 노출 여부: ${fallbackDuringReload > 0}`);
  await page.screenshot({ path: outPath('07-suspense-reloading.png') });
  await page.waitForTimeout(700);
  const afterReloadHasData = await page.getByText('ms 후 로드된 데이터').count();
  console.log(`[verify] 재로드 후(700ms) 데이터 재표시 여부: ${afterReloadHasData > 0}`);
  await page.screenshot({ path: outPath('08-suspense-reloaded.png') });

  const finalNodeCount = await page.locator('.react-flow__node').count();
  console.log(`[verify] 최종 노드 수: ${finalNodeCount}`);

  console.log(`[verify] 콘솔 에러 개수: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) console.log('[verify] 콘솔 에러 내용:', consoleErrors);
  console.log(`[verify] 페이지 에러(uncaught) 개수: ${pageErrors.length}`);
  if (pageErrors.length > 0) console.log('[verify] 페이지 에러 내용:', pageErrors);

  await browser.close();
  console.log(`[verify] 완료. 스크린샷: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[verify] 실패', err);
  process.exit(1);
});
