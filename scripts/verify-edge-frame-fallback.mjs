// 회귀 검증 — 크로스-그룹 연결이 "wide view에선 보이다 확대하면 사라지던" 버그 수정(toFlow 프레임 폴백).
// 라이브 MVP를 dev 서버로 띄운 상태에서 실행한다:
//   npm run dev -- --port 5191 &
//   BASE_URL=http://localhost:5191 node scripts/verify-edge-frame-fallback.mjs
//
// 원인: 크로스-그룹 간선은 양쪽 노드가 둘 다 펼쳐졌을 때만 만들어지는데, 확대하면 뷰포트 컬링
// (ADR-0017)으로 부모 노드가 화면 밖으로 나가 안 펼쳐지고 → 간선이 DOM에서 통째로 사라졌다.
// 수정: 부모 노드가 컬링되면 간선을 버리지 않고 부모의 그룹 프레임(항상 렌더됨)으로 잇는다
// (edge-cross-group-frame). 확대해도 "저쪽 도메인에서 들어오는 연결"이 계속 보인다.
//
// 확인: 초기(far)에서 상세 모드로 확대해 가며, 크로스-그룹 연결(노드↔노드 + 프레임 폴백)의
// 합계가 0으로 붕괴하지 않고 유지되는지 본다. 특히 부모가 컬링되는 깊은 줌에서 frame 폴백이 나온다.
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

  const grab = async () => {
    const zoom = Number(((await page.locator('.zoom-badge').textContent()) ?? '').match(/(\d+)%/)?.[1] ?? 0);
    const cls = (await page.locator('.canvas').getAttribute('class')) ?? '';
    const band = /zoom-far/.test(cls) ? 'far' : /zoom-mid/.test(cls) ? 'mid' : 'near';
    const e = await page.$$eval('.react-flow__edge', (els) => {
      const has = (x, c) => (x.getAttribute('class') || '').includes(c);
      const vis = (x) => Number(getComputedStyle(x).opacity) > 0.1;
      const cross = els.filter((x) => has(x, 'edge-cross-group'));
      const frame = els.filter((x) => has(x, 'edge-cross-group-frame'));
      return { crossVis: cross.filter(vis).length, frameVis: frame.filter(vis).length };
    });
    return { zoom, band, ...e };
  };

  // 초기(far)부터 상세 모드 깊은 줌까지 단계별로 확대하며 각 대역의 크로스-그룹 연결 수를 모은다.
  const bands = {}; // band -> 최대 크로스 연결 수(그 대역에서 관측된)
  const frameByBand = {};
  for (let step = 0; step < 12; step++) {
    const s = await grab();
    bands[s.band] = Math.max(bands[s.band] ?? 0, s.crossVis);
    frameByBand[s.band] = Math.max(frameByBand[s.band] ?? 0, s.frameVis);
    console.log(`z=${s.zoom}% ${s.band} | 크로스-그룹 연결 ${s.crossVis}개(그중 프레임 폴백 ${s.frameVis})`);
    const zi = page.locator('.react-flow__controls-zoomin');
    if (await zi.isEnabled().catch(() => false)) {
      await zi.click();
      await page.waitForTimeout(220);
    } else break;
  }

  let pass = true;
  const ok = (m) => console.log(`  ✓ ${m}`);
  const fail = (m) => {
    pass = false;
    console.log(`  ✗ ${m}`);
  };

  console.log('');
  // 상세 모드(mid/near)에서 크로스-그룹 연결이 하나라도 유지돼야 한다(예전엔 0으로 붕괴).
  const detailCross = Math.max(bands.mid ?? 0, bands.near ?? 0);
  if (detailCross > 0) ok(`상세 모드에서 크로스-그룹 연결이 유지됨(최대 ${detailCross}개, 예전엔 0으로 소멸)`);
  else fail('상세 모드에서 크로스-그룹 연결이 0으로 사라짐(버그 재발)');
  // 깊은 줌에서 부모가 컬링되면 프레임 폴백이 실제로 나와야 한다.
  const anyFrame = Math.max(frameByBand.mid ?? 0, frameByBand.near ?? 0);
  if (anyFrame > 0) ok(`부모 컬링 시 그룹 프레임 폴백 간선이 생성됨(최대 ${anyFrame}개)`);
  else fail('프레임 폴백 간선이 하나도 안 나옴(부모 컬링 케이스 미도달?)');

  console.log(`\n[verify-edge-frame-fallback] 콘솔 에러 ${consoleErrors.length}개`);
  if (consoleErrors.length) console.log('  에러:', consoleErrors);
  await browser.close();
  if (!pass || consoleErrors.length) {
    console.error('[verify-edge-frame-fallback] 실패');
    process.exit(1);
  }
  console.log('[verify-edge-frame-fallback] 전부 통과 ✓');
}

main().catch((err) => {
  console.error('[verify-edge-frame-fallback] 실패', err);
  process.exit(1);
});
