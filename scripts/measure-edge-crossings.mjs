// 진단 — 크로스-그룹(소유) 간선의 실제 교차를 세고 원인별로 분류한다.
// 목적: 남은 교차가 (a) 같은 소스 프레임 팬(기하적: 소유 노드 x ≠ 자식 그룹 x),
//       (b) 다른 서브트리 간 교차(cross-layer/형제 순서), (c) 다중부모 공유 컨테이너(Dialog)
//       중 무엇이 지배적인지 숫자로 가른다. 결과가 다음 작업 방향을 정한다(배치 planar 정렬 /
//       배선 cross-layer 트랙 / 공유 UI 레인).
//
//   npm run dev -- --port 5191 &
//   BASE_URL=http://localhost:5191 node scripts/measure-edge-crossings.mjs
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5191';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'render-board 열기' }).click();
  await page.waitForSelector('.react-flow__node', { timeout: 5000 });
  await page.waitForTimeout(1000);
  // "지도에서도 상세" 토글로 줌아웃해도 내부/간선 유지 → 전체 트리를 한 화면에 보며 측정.
  const wide = page.getByRole('checkbox', { name: /지도에서도 상세|상세/ }).first();
  if (await wide.isVisible().catch(() => false)) await wide.check().catch(() => {});
  await page.waitForTimeout(500);
  // 전체가 보이게 fitView(zoom-out 여러 번).
  const zo = page.locator('.react-flow__controls-zoomout');
  for (let i = 0; i < 3; i++) {
    if (await zo.isEnabled().catch(() => false)) {
      await zo.click();
      await page.waitForTimeout(120);
    }
  }
  await page.waitForTimeout(600);

  const res = await page.evaluate(() => {
    // --- 경로를 폴리라인으로 샘플 ---
    const edgeEls = [...document.querySelectorAll('.react-flow__edge.edge-cross-group')].filter(
      (e) => Number(getComputedStyle(e).opacity) > 0.08,
    );
    const frames = [...document.querySelectorAll('.react-flow__node')]
      .filter((n) => n.querySelector('.group-node'))
      .map((n) => {
        const r = n.getBoundingClientRect();
        const label = n.querySelector('.group-node__label, .group-node__title, .group-node')?.textContent || '';
        return { id: n.getAttribute('data-id'), r, label: label.trim().slice(0, 40) };
      });
    const contains = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    const frameAt = (x, y) => frames.find((f) => contains(f.r, x, y));

    const edges = [];
    for (const e of edgeEls) {
      const path = e.querySelector('.react-flow__edge-path');
      if (!path) continue;
      let L;
      try {
        L = path.getTotalLength();
      } catch {
        continue;
      }
      if (!L) continue;
      // getPointAtLength는 SVG user 좌표 → getScreenCTM으로 스크린 좌표로 변환해야 프레임
      // getBoundingClientRect(스크린)와 좌표계가 맞는다.
      const ctm = path.getScreenCTM();
      const pts = [];
      for (let s = 0; s <= L; s += 6) {
        const p = path.getPointAtLength(s);
        const sp = ctm ? new DOMPoint(p.x, p.y).matrixTransform(ctm) : p;
        pts.push({ x: sp.x, y: sp.y });
      }
      const a = pts[0];
      const b = pts[pts.length - 1];
      const srcFrame = frameAt(a.x, a.y);
      const tgtFrame = frameAt(b.x, b.y);
      edges.push({
        id: e.getAttribute('data-id') || '',
        pts,
        len: L,
        dy: Math.abs(b.y - a.y),
        srcId: srcFrame?.id ?? null,
        srcLabel: srcFrame?.label ?? '?',
        tgtId: tgtFrame?.id ?? null,
        tgtLabel: tgtFrame?.label ?? '?',
      });
    }

    // --- 세그먼트 교차 판정 ---
    const orient = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    function segCross(p1, p2, p3, p4) {
      const d1 = orient(p3, p4, p1);
      const d2 = orient(p3, p4, p2);
      const d3 = orient(p1, p2, p3);
      const d4 = orient(p1, p2, p4);
      return d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
    }
    const near = (a, b, t = 10) => Math.hypot(a.x - b.x, a.y - b.y) < t;
    // 두 간선이 "제대로 X 교차"하는가(공유 끝점/트렁크 겹침 제외).
    function edgesCross(A, B) {
      // 같은 소스 프레임에서 시작하면 트렁크를 공유(버스) — 시작부 겹침은 교차 아님.
      const shareStart = near(A.pts[0], B.pts[0], 14);
      const shareEnd = near(A.pts[A.pts.length - 1], B.pts[B.pts.length - 1], 14);
      for (let i = 0; i < A.pts.length - 1; i++) {
        for (let j = 0; j < B.pts.length - 1; j++) {
          if (!segCross(A.pts[i], A.pts[i + 1], B.pts[j], B.pts[j + 1])) continue;
          // 교차점이 공유 끝점 근처면 무시.
          const mid = { x: (A.pts[i].x + A.pts[i + 1].x) / 2, y: (A.pts[i].y + A.pts[i + 1].y) / 2 };
          if (shareStart && (near(mid, A.pts[0], 20) || near(mid, B.pts[0], 20))) continue;
          if (shareEnd && (near(mid, A.pts[A.pts.length - 1], 20) || near(mid, B.pts[B.pts.length - 1], 20)))
            continue;
          return true;
        }
      }
      return false;
    }

    // 다중부모 공유 컨테이너 = "Dialog.tsx" 그룹만(SettingsDialog/ProfileDialog는 단일부모 부모).
    const isDialog = (lbl) => lbl.startsWith('Dialog.tsx');
    let sameSourceFan = 0,
      interSubtree = 0,
      multiParent = 0;
    const samples = [];
    for (let i = 0; i < edges.length; i++) {
      for (let k = i + 1; k < edges.length; k++) {
        const A = edges[i];
        const B = edges[k];
        if (!edgesCross(A, B)) continue;
        const dialog = isDialog(A.srcLabel) || isDialog(A.tgtLabel) || isDialog(B.srcLabel) || isDialog(B.tgtLabel);
        if (dialog) multiParent++;
        else if (A.srcId && A.srcId === B.srcId) sameSourceFan++;
        else interSubtree++;
        if (samples.length < 12)
          samples.push(
            `${A.srcLabel}→${A.tgtLabel}  ✕  ${B.srcLabel}→${B.tgtLabel}` +
              (dialog ? '  [Dialog]' : A.srcId === B.srcId ? '  [same-fan]' : '  [inter-subtree]'),
          );
      }
    }

    // Dialog(다중부모) 간선들의 길이/교차 여부.
    const dialogEdges = edges.filter((e) => isDialog(e.srcLabel) || isDialog(e.tgtLabel));

    return {
      edgeCount: edges.length,
      frameCount: frames.length,
      totalCrossings: sameSourceFan + interSubtree + multiParent,
      sameSourceFan,
      interSubtree,
      multiParent,
      samples,
      dialogEdgeCount: dialogEdges.length,
      dialogEdges: dialogEdges.map((e) => ({ from: e.srcLabel, to: e.tgtLabel, len: Math.round(e.len), dy: Math.round(e.dy) })),
      dialogFrames: frames.filter((f) => isDialog(f.label)).map((f) => f.label),
    };
  });

  console.log('=== 크로스-그룹(소유) 간선 교차 진단 ===');
  console.log(`간선 ${res.edgeCount}개 · 그룹 프레임 ${res.frameCount}개`);
  console.log(`총 교차 쌍: ${res.totalCrossings}`);
  console.log(`  - 같은 소스 팬(기하적, 소유노드x≠자식그룹x): ${res.sameSourceFan}`);
  console.log(`  - 다른 서브트리 간(cross-layer/형제순서):     ${res.interSubtree}`);
  console.log(`  - 다중부모(Dialog) 연루:                      ${res.multiParent}`);
  console.log(`\nDialog(다중부모) 프레임: ${res.dialogFrames.join(', ') || '(없음)'}`);
  console.log(`Dialog 연결 간선 ${res.dialogEdgeCount}개:`);
  for (const d of res.dialogEdges) console.log(`  ${d.from} → ${d.to}  (len ${d.len}, dy ${d.dy})`);
  console.log(`\n교차 샘플:`);
  for (const s of res.samples) console.log(`  ${s}`);
  if (consoleErrors.length) console.log(`\n콘솔 에러 ${consoleErrors.length}개:`, consoleErrors.slice(0, 3));

  await browser.close();
}

main().catch((err) => {
  console.error('[measure-edge-crossings] 실패', err);
  process.exit(1);
});
