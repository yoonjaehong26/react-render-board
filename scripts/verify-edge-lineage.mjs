// 연구문서 7절 c 검증 — hover 혈통 점등(간선 클러터 감쇠 후속, ADR-0041 후속).
// 라이브 MVP를 dev 서버로 띄운 상태에서 실행한다:
//   npm run dev -- --port 5191 &
//   BASE_URL=http://localhost:5191 node scripts/verify-edge-lineage.mjs
//
// DeepTree fixture(Level1→…→Level6이 한 그룹)를 대상으로, 중간 노드(Level3)에 마우스를 올렸을 때:
//   - 그 노드의 조상 체인(Level1→2→3) + 자손 서브트리(Level3→4→5→6) 간선만 edge-lineage로 점등
//     되고 opacity가 1로 되살아난다(상시 깊이 감쇠를 무시).
//   - 혈통이 아닌 다른 모든 간선은 거의 지워진다(opacity ≈ 0.06).
//   - 마우스를 떼면 lineage-active가 풀리고 원래 감쇠 상태로 복귀한다.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openBoard } from './lib/openBoard.mjs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5191';
const OUT_DIR = fileURLToPath(new URL('../verify-output/edge-lineage/', import.meta.url));
const outPath = (name) => path.join(OUT_DIR, name);

async function collectEdges(page) {
  return page.$$eval('.react-flow__edge', (els) =>
    els
      .map((el) => {
        const path = el.querySelector('.react-flow__edge-path');
        return {
          id: el.getAttribute('data-id'),
          cls: el.getAttribute('class') ?? '',
          opacity: Number(getComputedStyle(el).opacity),
          strokeWidth: path ? Number(getComputedStyle(path).strokeWidth.replace('px', '')) : 0,
          stroke: path ? getComputedStyle(path).stroke : '',
        };
      })
      .filter((e) => !e.cls.includes('edge-group-link')),
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await openBoard(page);
  await page.waitForSelector('.react-flow__node', { timeout: 5000 });
  await page.waitForTimeout(800);

  // DeepTree 그룹을 검색으로 펼치고 카메라 이동. 그다음 검색어를 지워 검색 dimming과 혈통
  // dimming이 섞이지 않게 한다(검색은 그룹 확장 용도로만 쓰고 hover 효과를 깨끗이 관찰).
  await page.locator('.toolbar__search').fill('Level');
  await page.waitForTimeout(900);
  // 상세 대역으로 살짝만 줌인(과하면 뷰포트 컬링으로 사슬 일부가 잘린다).
  const box = await page.locator('.react-flow').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);

  // 노드 id → 이름 맵(간선의 source/target 숫자 id를 컴포넌트 이름으로 해석해 조상/자손 방향 검증).
  const idToName = Object.fromEntries(
    await page.$$eval('.react-flow__node', (els) =>
      els
        .map((el) => [el.getAttribute('data-id'), el.querySelector('.component-node__name')?.textContent ?? ''])
        .filter(([, name]) => name),
    ),
  );

  let pass = true;
  const fail = (m) => {
    pass = false;
    console.log(`  ✗ ${m}`);
  };
  const ok = (m) => console.log(`  ✓ ${m}`);

  const before = await collectEdges(page);
  console.log(`[사전] 노드 레벨 간선 ${before.length}개(감쇠 적용, 혈통 hover 전)`);

  // Level3 노드에 hover — 조상(Level1→2→3) + 자손(Level3→4→5→6)이 혈통이 된다.
  const level3 = page
    .locator('.component-node', { has: page.locator('.component-node__name', { hasText: /^Level3$/ }) })
    .first();
  await level3.waitFor({ state: 'visible', timeout: 5000 });
  await level3.hover({ force: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: outPath('01-hover-lineage.png') });

  const lineageActive = (await page.locator('.canvas.lineage-active').count()) > 0;
  const hov = await collectEdges(page);
  const lit = hov.filter((e) => e.cls.includes('edge-lineage'));
  const dimmed = hov.filter((e) => !e.cls.includes('edge-lineage'));
  console.log(`\n[hover Level3] lineage-active: ${lineageActive}`);
  console.log(`  점등(edge-lineage) 간선 ${lit.length}개, 평균 opacity ${(lit.reduce((s, e) => s + e.opacity, 0) / (lit.length || 1)).toFixed(2)}`);
  console.log(`  나머지 간선 ${dimmed.length}개, 평균 opacity ${(dimmed.reduce((s, e) => s + e.opacity, 0) / (dimmed.length || 1)).toFixed(2)}`);

  if (lineageActive) ok('hover 시 .canvas에 lineage-active 적용됨');
  else fail('hover했는데 lineage-active가 안 붙음');
  // 양방향 탐색 증명(선형 체인이라 개수만으론 방향을 못 가린다): 간선의 source/target을 이름으로
  // 풀어, Level3로 "들어오는" 간선(target=Level3, 조상 방향)과 Level3에서 "나가는" 간선(source=Level3,
  // 자손 방향)이 둘 다 점등됐는지 본다.
  const parse = (e) => {
    const [s, t] = (e.id ?? '').split('->');
    return { source: idToName[s], target: idToName[t] };
  };
  const litAncestor = lit.some((e) => parse(e).target === 'Level3'); // 부모→Level3
  const litDescendant = lit.some((e) => parse(e).source === 'Level3'); // Level3→자식
  if (litAncestor) ok('조상 방향 간선(부모→Level3) 점등됨(위로 탐색)');
  else fail('조상 방향 간선이 점등 안 됨');
  if (litDescendant) ok('자손 방향 간선(Level3→자식) 점등됨(아래로 BFS)');
  else fail('자손 방향 간선이 점등 안 됨');
  if (lit.length && lit.every((e) => e.opacity > 0.9)) ok(`점등 간선 ${lit.length}개 모두 opacity≈1(깊이 감쇠 무시)`);
  else fail(`점등 간선 opacity가 낮다 — ${JSON.stringify(lit.map((e) => e.opacity))}`);
  // 강한 하이라이팅: 굵기 3 + 부모 도메인 색 클래스.
  if (lit.length && lit.every((e) => e.strokeWidth >= 2.5)) ok(`점등 간선이 굵게(strokeWidth≈3) 강조됨`);
  else fail(`점등 간선이 안 굵어짐 — ${JSON.stringify(lit.map((e) => e.strokeWidth))}`);
  if (lit.length && lit.every((e) => /edge-parent-palette-\d/.test(e.cls))) ok('점등 간선에 부모 도메인 색 클래스(edge-parent-palette-N) 부여됨');
  else fail('점등 간선에 부모 팔레트 클래스가 없다');
  if (dimmed.length && dimmed.every((e) => e.opacity <= 0.1)) ok(`혈통 아닌 간선 ${dimmed.length}개 거의 지워짐(opacity ≤ 0.1)`);
  else if (dimmed.length) fail(`혈통 아닌 간선이 덜 지워짐 — 평균 ${(dimmed.reduce((s, e) => s + e.opacity, 0) / dimmed.length).toFixed(2)}`);
  else console.log('  (뷰포트에 혈통 아닌 간선이 없어 dim 대상 없음 — 정상)');

  // 노드 쪽 짝(ADR-0044/0047 후속): 혈통 노드는 lineage-on, 혈통 밖 노드는 lineage-off(흐리게).
  const nodes = await page.$$eval('.component-node', (els) =>
    els.map((el) => ({
      name: el.querySelector('.component-node__name')?.textContent ?? '',
      on: el.classList.contains('component-node--lineage-on'),
      off: el.classList.contains('component-node--lineage-off'),
    })),
  );
  const onNodes = nodes.filter((n) => n.on);
  const offNodes = nodes.filter((n) => n.off);
  console.log(`\n[노드 dimming] lineage-on: ${onNodes.map((n) => n.name).join(',')} | lineage-off ${offNodes.length}개`);
  if (nodes.find((n) => n.name === 'Level3')?.on) ok('hover한 Level3 노드가 lineage-on(강조)');
  else fail('hover한 노드가 lineage-on이 아님');
  if (onNodes.some((n) => /^Level\d$/.test(n.name)) && onNodes.length >= 3)
    ok(`혈통 노드 ${onNodes.length}개가 lineage-on(조상+자손 사슬)`);
  else fail(`혈통 노드 강조가 부족 — on ${onNodes.length}개`);
  if (offNodes.length > 0) ok(`혈통 밖 노드 ${offNodes.length}개가 lineage-off(흐리게)`);
  else fail('혈통 밖 노드가 하나도 안 흐려짐(dimming 미작동?)');

  // 마우스를 떼면 복구.
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.waitForTimeout(300);
  const leaveActive = (await page.locator('.canvas.lineage-active').count()) > 0;
  const after = await collectEdges(page);
  await page.screenshot({ path: outPath('02-after-leave.png') });
  console.log(`\n[leave] lineage-active: ${leaveActive}`);
  if (!leaveActive) ok('마우스를 떼면 lineage-active 해제됨');
  else fail('마우스를 뗐는데 lineage-active가 남아있음');
  // 복구: 점등/dim이 사라져 hover 전과 같은 개수의 "보이는" 간선으로 돌아온다.
  const visBefore = before.filter((e) => e.opacity > 0.1).length;
  const visAfter = after.filter((e) => e.opacity > 0.1).length;
  if (Math.abs(visBefore - visAfter) <= 1) ok(`간선 가시성 복구(before ${visBefore} ≈ after ${visAfter})`);
  else fail(`복구 불일치 — before ${visBefore}, after ${visAfter}`);

  console.log(`\n[verify-edge-lineage] 콘솔 에러 ${consoleErrors.length}개`);
  if (consoleErrors.length) console.log('  에러:', consoleErrors);
  console.log(`[verify-edge-lineage] 스크린샷: ${OUT_DIR}`);
  await browser.close();
  if (!pass || consoleErrors.length) {
    console.error('[verify-edge-lineage] 실패 — 위 ✗ 확인');
    process.exit(1);
  }
  console.log('[verify-edge-lineage] 전부 통과 ✓');
}

main().catch((err) => {
  console.error('[verify-edge-lineage] 실패', err);
  process.exit(1);
});
