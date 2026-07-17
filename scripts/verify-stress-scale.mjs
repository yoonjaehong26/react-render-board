// 스트레스 테스트: exp2(합성 데이터, 훅킹 없음)를 2,000 / 5,000 노드, 그리고 그룹 120개
// 규모로 돌려 "컴포넌트 수백~수천 개" 중 검증 안 됐던 "수천" 쪽을 확인한다.
// 지금까지 최대 검증 규모는 excalidraw 646개 노드(호스트 포함) — 이 스크립트는 순수 캔버스
// 렌더링/레이아웃 성능만 본다(실제 React 커밋/notify 디바운스 비용은 다루지 않음 —
// 그건 scripts/verify-stress-live.mjs가 라이브 MVP로 별도로 잰다).
//
// 실행 방법:
//   cd experiments/exp2-flow-prototype && npm run dev -- --port 5195 &
//   BASE_URL=http://localhost:5195 node ../../scripts/verify-stress-scale.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5195';
const OUT_DIR = fileURLToPath(new URL('../verify-output/stress-scale/', import.meta.url));
const outPath = (name) => path.join(OUT_DIR, name);

const SCENARIOS = [
  { value: 'large', label: 'large (기존 기준선)' },
  { value: 'xlarge2000', label: 'xlarge2000' },
  { value: 'xlarge5000', label: 'xlarge5000' },
  { value: 'manyGroups', label: 'manyGroups (그룹 120개)' },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  const results = [];

  for (const { value, label } of SCENARIOS) {
    const t0 = Date.now();
    await page.selectOption('select', value);
    // computeMs 텍스트가 갱신될 때까지, 그리고 노드가 DOM에 커밋될 때까지 대기.
    await page.waitForFunction(
      (v) => document.querySelector('select')?.value === v,
      value,
      { timeout: 5000 },
    );
    await page.waitForSelector('.react-flow__node', { timeout: 30000 });
    // React Flow가 fitView까지 안정화되도록 짧게 대기.
    await page.waitForTimeout(400);
    const wallMs = Date.now() - t0;

    const computeMsText = await page.locator('.toolbar__compute-ms').textContent();
    const domNodeCount = await page.locator('.react-flow__node').count();
    const totalCountText = await page.locator('.toolbar__count').textContent();

    console.log(`[stress-scale] ${label}: wall=${wallMs}ms, computeMs=${computeMsText}, DOM 노드=${domNodeCount}, 표시=${totalCountText}`);

    await page.screenshot({ path: outPath(`${value}-01-fitview.png`) });

    // 지도 모드까지 줌아웃해 그룹 라벨 겹침을 스크린샷으로 확인.
    const canvas = page.locator('.canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 14; i++) {
      await page.mouse.wheel(0, 120);
    }
    await page.waitForTimeout(300);
    const zoomBadge = await page.locator('.zoom-badge').textContent();
    await page.screenshot({ path: outPath(`${value}-02-mapmode.png`) });

    // 그룹 라벨 bounding box 겹침을 코드로도 확인 (스크린샷 육안 확인의 보조 지표).
    const labelBoxes = await page.locator('.group-node__label').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    let overlapCount = 0;
    for (let i = 0; i < labelBoxes.length; i++) {
      for (let j = i + 1; j < labelBoxes.length; j++) {
        const a = labelBoxes[i];
        const b = labelBoxes[j];
        const overlapX = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        if (overlapX > 0 && overlapY > 0) overlapCount++;
      }
    }
    console.log(`[stress-scale] ${label}: 지도 모드(${zoomBadge}) 그룹 라벨 수=${labelBoxes.length}, 겹치는 라벨 쌍=${overlapCount}`);

    results.push({ label, wallMs, computeMsText, domNodeCount, groupLabelCount: labelBoxes.length, overlapCount });

    // 다시 줌인 원상복구 (fitView 재실행 대신 다음 select가 데이터셋을 바꾸며 자연히 리셋됨).
  }

  console.log('[stress-scale] 콘솔/페이지 에러 개수:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.log('[stress-scale] 에러 내용(최대 20개):', consoleErrors.slice(0, 20));
  }

  console.log('\n[stress-scale] 요약:');
  console.table(results.map((r) => ({
    시나리오: r.label,
    'wall(ms)': r.wallMs,
    computeMs: r.computeMsText,
    'DOM 노드': r.domNodeCount,
    '그룹 라벨': r.groupLabelCount,
    '겹침 쌍': r.overlapCount,
  })));

  await browser.close();
  console.log(`[stress-scale] 완료. 스크린샷: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[stress-scale] 실패', err);
  process.exit(1);
});
