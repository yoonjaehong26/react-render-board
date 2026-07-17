// ADR-0011 검증 스크립트 — React.lazy(코드 스플리팅) + Suspense 경계가 계측 파이프라인을
// 통과하는지 확인한다. ADR-0009 ④가 excalidraw로는 확인하지 못하고 남긴 항목이다.
// 라이브 MVP를 dev 서버로 띄운 상태에서 실행한다:
//   npm run dev -- --port 5186 &
//   BASE_URL=http://localhost:5186 node scripts/verify-lazy-suspense.mjs
//
// 확인하는 것:
// 1. 동적 import 트리거 전에는 LazyReportView.tsx 그룹이 존재하지 않는가.
// 2. "보고서 열기" 클릭 직후 Suspense fallback이 커밋에 반영되는가.
// 3. import()+지연(400ms) resolve 후 LazyReportView가 실제 컴포넌트 이름으로 그룹/노드에
//    잡히는가(익명이나 다른 이름으로 뭉개지지 않는가).
// 4. 패널을 닫았다가 다시 열었을 때(캐시된 lazy 모듈 재사용) 문제없이 재마운트되는가.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openBoard } from './lib/openBoard.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5186';
const OUT_DIR = fileURLToPath(new URL('../verify-output/lazy-suspense/', import.meta.url));
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
  await openBoard(page);
  await page.waitForSelector('.react-flow__node', { timeout: 5000 });
  await page.waitForTimeout(700); // groupHint 비동기 해석 대기

  const groupsBefore = await page.locator('.group-node__label').allTextContents();
  console.log('[verify] 보고서 열기 전 그룹 라벨들:', groupsBefore);
  console.log(`[verify] LazyReportView.tsx 그룹이 미리 존재하는가: ${groupsBefore.includes('LazyReportView.tsx')} (false여야 정상)`);
  await page.screenshot({ path: outPath('01-before-open.png') });

  // 1. 보고서 열기 — Suspense fallback 구간 포착 시도
  await page.getByRole('button', { name: '보고서 열기' }).click();
  let sawFallback = false;
  for (let i = 0; i < 20; i++) {
    const fallbackCount = await page.getByText('보고서 로딩 중').count();
    if (fallbackCount > 0) {
      sawFallback = true;
      await page.screenshot({ path: outPath('02-suspense-fallback.png') });
      break;
    }
    await page.waitForTimeout(20);
  }
  console.log(`[verify] Suspense fallback을 포착했는가: ${sawFallback}`);

  // 2. resolve 대기 후 실제 컴포넌트 확인
  await page.waitForTimeout(900); // import() + 400ms 인위 지연 + groupHint 해석
  const reportVisible = await page.getByText('Q1 매출').count();
  console.log(`[verify] resolve 후 보고서 내용(Q1 매출) 노출 여부: ${reportVisible > 0}`);
  const groupsAfter = await page.locator('.group-node__label').allTextContents();
  console.log('[verify] resolve 후 그룹 라벨들:', groupsAfter);
  console.log(`[verify] LazyReportView.tsx 그룹이 실제 이름으로 잡혔는가: ${groupsAfter.includes('LazyReportView.tsx')}`);
  await page.screenshot({ path: outPath('03-after-resolve.png') });

  // 3. 닫았다가 다시 열기 — 캐시된 lazy 모듈 재사용 경로
  await page.getByRole('button', { name: '보고서 닫기' }).click();
  await page.waitForTimeout(300);
  const groupsAfterClose = await page.locator('.group-node__label').allTextContents();
  console.log(`[verify] 닫은 후 LazyReportView.tsx 그룹 잔존 여부: ${groupsAfterClose.includes('LazyReportView.tsx')} (false여야 정상)`);
  await page.screenshot({ path: outPath('04-after-close.png') });

  await page.getByRole('button', { name: '보고서 열기' }).click();
  await page.waitForTimeout(600);
  const reportVisibleAgain = await page.getByText('Q1 매출').count();
  console.log(`[verify] 재-오픈 후 보고서 내용 재노출 여부: ${reportVisibleAgain > 0}`);
  await page.screenshot({ path: outPath('05-reopened.png') });

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
