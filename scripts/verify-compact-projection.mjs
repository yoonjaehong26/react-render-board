// ADR-0093 검증 — strict waterfall 기반 밀집 모드가 넓은 서브트리만 국소 Summary 카드로 접고,
// host 상세가 raw host 노드를 캔버스에 늘어놓지 않는지 확인.
// npm run dev -- --host 127.0.0.1 --port 5191 &
// BASE_URL=http://127.0.0.1:5191 npm run verify:compact
import { chromium } from 'playwright';
import { openBoard } from './lib/openBoard.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5191';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await openBoard(page);
  await page.waitForSelector('.react-flow__node', { timeout: 5000 });
  await page.waitForTimeout(700);
  // 초기 fitView가 지도 모드일 수 있으므로, 비교 전에는 기본 waterfall의 실제 컴포넌트를 명시적으로
  // 펼친다. 밀집 모드는 이 기본 waterfall 위에서 일부 서브트리만 접는다.
  await page.locator('label', { hasText: '지도에서도 상세' }).locator('input').check();
  await page.waitForTimeout(250);

  const normalComponentCount = await page.locator('.react-flow__node .component-node').count();
  await page.locator('label', { hasText: '밀집 모드' }).locator('input').check();
  await page.waitForTimeout(250);
  const compactComponentCount = await page.locator('.react-flow__node .component-node').count();
  const compactGroupCount = await page.locator('.react-flow__node .group-node').count();
  const actualEdgeCount = await page.locator('.react-flow__edge').count();
  const summaryEdges = await page.locator('.react-flow__edge.edge-compact-summary').count();

  const expand = page.getByRole('button', { name: '밀집 요약 펼치기' }).first();
  await expand.click({ force: true });
  await page.waitForTimeout(250);
  const expandedComponentCount = await page.locator('.react-flow__node .component-node').count();

  const recompact = page.getByRole('button', { name: '밀집 요약으로 접기' }).first();
  await recompact.click({ force: true });
  await page.waitForTimeout(250);
  const recompactedComponentCount = await page.locator('.react-flow__node .component-node').count();

  await page.locator('label', { hasText: 'host 상세' }).locator('input').check();
  const hostEnabledComponentCount = await page.locator('.react-flow__node .component-node').count();

  let pass = true;
  const ok = (message) => console.log(`  ✓ ${message}`);
  const fail = (message) => {
    pass = false;
    console.log(`  ✗ ${message}`);
  };
  if (compactComponentCount < normalComponentCount) ok(`넓은 서브트리만 요약해 컴포넌트 ${normalComponentCount}→${compactComponentCount}`);
  else fail(`밀집 모드가 요약하지 못했다 — 기본 ${normalComponentCount}, 밀집 ${compactComponentCount}`);
  if (compactGroupCount > 0) ok('기본 파일 그룹/waterfall 구조를 유지');
  else fail('밀집 모드가 기본 파일 그룹 구조를 잃었다');
  if (actualEdgeCount > 0 && summaryEdges > 0) ok(`요약카드 연결 ${summaryEdges}개와 실제 간선 함께 표시`);
  else fail(`간선 검증 실패 — 실제 ${actualEdgeCount}, Summary ${summaryEdges}`);
  if (expandedComponentCount > compactComponentCount) ok('요약카드 하나만 strict waterfall으로 펼침');
  else fail(`요약카드 확장 실패 — ${compactComponentCount}→${expandedComponentCount}`);
  if (recompactedComponentCount === compactComponentCount) ok('펼친 source를 같은 위치에서 다시 요약');
  else fail(`재요약 실패 — 기대 ${compactComponentCount}, 실제 ${recompactedComponentCount}`);
  if (hostEnabledComponentCount === recompactedComponentCount) ok('host 상세 토글이 raw host 노드를 추가하지 않음');
  else fail(`host 상세가 구조 노드를 늘렸다 — ${recompactedComponentCount}→${hostEnabledComponentCount}`);
  if (errors.length) fail(`콘솔 에러 ${errors.length}개: ${errors.join('; ')}`);

  await browser.close();
  if (!pass) process.exit(1);
  console.log('[verify:compact] 전부 통과 ✓');
}

main().catch((error) => {
  console.error('[verify:compact] 실패', error);
  process.exit(1);
});
