// 검증 — 크로스-그룹 간선의 규칙 기반 직교 배선(ADR-0029 §5, OrthoEdge/edgeRouting).
// 라이브 MVP를 dev 서버로 띄운 상태에서 실행한다:
//   npm run dev -- --port 5191 &
//   BASE_URL=http://localhost:5191 node scripts/verify-edge-routing.mjs
//
// 크로스-그룹 간선(그룹 경계를 넘는 것)은 그룹 프레임을 장애물로 보고 빈 거터로 직교 배선한다.
// 확인: 상세 줌에서 크로스-그룹 간선이 "자기 소스/타깃 그룹이 아닌" 프레임을 관통하지 않는다
// (경로 끝점을 담은 프레임 = 자기 그룹이라 진입은 정상, 제외). 예전 smoothstep은 중간 프레임을
// 직선으로 관통했다.
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5191';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'render-board 열기' }).click();
  await page.waitForSelector('.react-flow__node', { timeout: 5000 });
  await page.waitForTimeout(1000);
  // 컴포넌트 상세 모드로 확대한다. 초기 fitView 배율은 트리 폭에 따라 달라 최소 지도 임계값을
  // 넘길 때까지 확인한다. 상세 확대율에서는 항상 같은 실제 관계선을 쓴다(ADR-0090).
  const zi = page.locator('.react-flow__controls-zoomin');
  for (let i = 0; i < 15; i++) {
    const canvasClass = (await page.locator('.canvas').getAttribute('class')) ?? '';
    if (canvasClass.includes('zoom-near')) break;
    if (await zi.isEnabled().catch(() => false)) {
      await zi.click();
      await page.waitForTimeout(160);
    }
  }
  await page.waitForTimeout(800);

  const res = await page.evaluate(() => {
    const edges = [...document.querySelectorAll('.react-flow__edge.edge-cross-group')].filter(
      (e) => Number(getComputedStyle(e).opacity) > 0.1,
    );
    const frames = [...document.querySelectorAll('.react-flow__node')]
      .filter((n) => n.querySelector('.group-node'))
      .map((n) => ({ id: n.getAttribute('data-id'), r: n.getBoundingClientRect() }));
    const inRect = (x, y, r) => x >= r.left + 6 && x <= r.right - 6 && y >= r.top + 6 && y <= r.bottom - 6;
    const contains = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    let cut = 0,
      tot = 0,
      ortho = 0;
    const cutIds = [];
    for (const e of edges) {
      const path = e.querySelector('.react-flow__edge-path');
      if (!path) continue;
      let L;
      try {
        L = path.getTotalLength();
      } catch {
        continue;
      }
      if (!L) continue;
      tot++;
      const d = path.getAttribute('d') || '';
      // 일반 OrthoEdge는 라운드 코너(Q)를, same-source single-ink 버스(ADR-0083)는 trunk/bar/stub을
      // 여러 SVG subpath(M)로 표현한다. 단일 parent→child가 정확히 수직이면 단순 M→L 한 선분이
      // 되므로 Q·복수 M이 없어도 직교 경로다. Bézier(C/S)·호(A)가 없는지를 검사한다(H/V도 직교다).
      if (!/[CSA]/.test(d)) ortho++;
      const p0 = path.getPointAtLength(0);
      const p1 = path.getPointAtLength(L);
      const own = frames.filter((f) => contains(f.r, p0.x, p0.y) || contains(f.r, p1.x, p1.y)).map((f) => f.id);
      let hit = false,
        hf = '';
      for (let s = 0; s <= L; s += 4) {
        const pt = path.getPointAtLength(s);
        for (const f of frames) {
          if (own.includes(f.id)) continue;
          if (inRect(pt.x, pt.y, f.r)) {
            hit = true;
            hf = f.id;
            break;
          }
        }
        if (hit) break;
      }
      if (hit) {
        cut++;
        cutIds.push(e.getAttribute('data-id') + ' cuts ' + hf);
      }
    }
    return { tot, cut, ortho, cutIds, frameCount: frames.length };
  });

  let pass = true;
  const ok = (m) => console.log(`  ✓ ${m}`);
  const fail = (m) => {
    pass = false;
    console.log(`  ✗ ${m}`);
  };

  console.log(`크로스-그룹 간선 ${res.tot}개(그룹 프레임 ${res.frameCount}개), 그중 ortho 경로 ${res.ortho}개`);
  if (res.tot === 0) fail('크로스-그룹 간선이 하나도 안 보임 — 줌/뷰포트 문제?');
  else {
    if (res.ortho === res.tot) ok(`모든 크로스-그룹 간선이 직교(ortho) 경로로 배선됨`);
    else fail(`ortho 경로가 아닌 크로스-그룹 간선이 있음(${res.tot - res.ortho}개)`);
    if (res.cut === 0) ok('크로스-그룹 간선이 남의 그룹 프레임을 관통하지 않음(거터 배선)');
    else fail(`남의 프레임 관통 ${res.cut}개: ${res.cutIds.join('; ')}`);
  }

  console.log(`\n[verify-edge-routing] 콘솔 에러 ${consoleErrors.length}개`);
  if (consoleErrors.length) console.log('  에러:', consoleErrors);
  await browser.close();
  if (!pass || consoleErrors.length) {
    console.error('[verify-edge-routing] 실패');
    process.exit(1);
  }
  console.log('[verify-edge-routing] 전부 통과 ✓');
}

main().catch((err) => {
  console.error('[verify-edge-routing] 실패', err);
  process.exit(1);
});
