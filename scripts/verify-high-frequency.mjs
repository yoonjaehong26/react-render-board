// 고빈도 렌더 갱신 스트레스 테스트 (ADR-0013).
//
// 지금까지의 성능 검증(ADR-0009, ADR-0012)은 전부 "도형 몇 개를 수동으로 그리는" 짧고
// 산발적인 상호작용이었다. 이 스크립트는 자체 fixture(src/fixtures/domains/livefeed/LiveFeed.tsx)의
// setInterval 기반 고빈도 state 갱신(10/30/60/120/240Hz)으로 초당 여러 번 지속되는 커밋
// 부하를 재현하고, ADR-0012가 도입한 구독자 notify 디바운스(requestIdleCallback, 100ms 캡)가
// 이 부하에서도 버티는지 확인한다.
//
// 측정 방법론은 ADR-0009/0012의 "보드 열림 vs 닫힘" 응답시간 비교를 그대로 재사용한다.
// main.tsx가 새로 지원하는 ?board=off 쿼리 파라미터로 Canvas 마운트 여부만 다르게 하고
// (계측/handleCommit 자체는 두 경우 모두 동일하게 동작), 같은 상호작용의 소요 시간을 비교한다.
//
// 확인하는 것 (Hz 단계마다):
// 1. 디바운스 배치 효과 — 실제 fiber 커밋 수(toolbar의 "커밋 #N") 대비 Canvas가 실제로
//    다시 그려진 횟수(toolbar 텍스트 변경 횟수, MutationObserver로 관찰)의 비율.
//    비율이 1에 가까우면 디바운스가 사실상 매 커밋 실행되어 무력화된 것이고, 클수록 배치가 되는 것이다.
// 2. 프레임 드랍 — rAF 루프로 프레임 간격을 기록해 32ms(30fps 미만) / 50ms(20fps 미만) 초과 비율을 낸다.
// 3. host 앱 상호작용 응답성 — Counter 버튼을 N번 연타하는 데 걸리는 시간을 board=on/off로 비교.
//    architecture.md 원칙("계측이 대상 앱을 방해하면 안 된다")을 위반하는지 판단하는 핵심 지표다.
// 4. 메모리 누수 — 대표 Hz로 5분 이상 지속 실행하며 CDP Performance.getMetrics()의
//    JSHeapUsedSize/Nodes를 주기적으로 샘플링해 우상향 추세(누수)인지 플래토(정상)인지 본다.
//
// 실행 방법:
//   npm run dev -- --port 5184 &
//   BASE_URL=http://localhost:5184 node scripts/verify-high-frequency.mjs
//
// 환경변수로 단계 축소 가능 (빠른 스모크용): SKIP_MEMORY_SOAK=1, MEMORY_SOAK_MS=<ms>
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5184';
const FREQUENCIES = [0, 10, 30, 60, 120, 240];
const RECORD_MS = 4000;
const WARMUP_MS = 500;
// 단일 실행은 Playwright/브라우저 스케줄링 노이즈(GC, OS 스케줄러)에 크게 흔들린다
// (스모크 테스트에서 hz=0 board=on이 board=off보다 빠르게 나오는 등 비단조 결과 확인).
// ADR-0009/0012가 5회 반복으로 노이즈를 줄인 것과 같은 이유로 REPEATS번 반복해 중앙값을 쓴다.
const REPEATS = Number(process.env.REPEATS ?? 3);
const MEMORY_SOAK_HZ = 60;
const MEMORY_SOAK_MS = Number(process.env.MEMORY_SOAK_MS ?? 5 * 60 * 1000);
const MEMORY_SAMPLE_INTERVAL_MS = 15000;
const SKIP_MEMORY_SOAK = process.env.SKIP_MEMORY_SOAK === '1';
const SKIP_STEPWISE = process.env.SKIP_STEPWISE === '1';

function fmt(n, digits = 1) {
  return Number.isFinite(n) ? n.toFixed(digits) : 'n/a';
}

function median(nums) {
  const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (xs.length === 0) return NaN;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
}

function frameStats(frames) {
  if (frames.length === 0) return { avgFps: NaN, over32ms: 0, over50ms: 0, maxMs: 0, count: 0 };
  const over32 = frames.filter((d) => d > 32).length;
  const over50 = frames.filter((d) => d > 50).length;
  const avgDelta = frames.reduce((a, b) => a + b, 0) / frames.length;
  return {
    avgFps: 1000 / avgDelta,
    over32ms: (over32 / frames.length) * 100,
    over50ms: (over50 / frames.length) * 100,
    maxMs: Math.max(...frames),
    count: frames.length,
  };
}

// 지정된 Hz로 LiveFeed를 시작하고, RECORD_MS 동안 프레임 타이밍 + longtask +
// (board=on이면) toolbar 커밋 카운트/재렌더 횟수를 동시에 관찰하면서, 그 창 안에서
// Counter 버튼 연타 응답 시간도 함께 잰다.
async function measureAtFrequency(page, hz, boardOn) {
  if (hz > 0) {
    await page.getByRole('button', { name: `${hz}Hz 시작` }).click();
  } else {
    await page.getByRole('button', { name: '정지' }).click();
  }
  await page.waitForTimeout(WARMUP_MS);

  await page.evaluate(
    ({ recordMs, boardOn }) => {
      window.__rrb = { frames: [], longTaskDurations: [], mutationCount: 0, startCommitId: null, endCommitId: null };
      const state = window.__rrb;
      const start = performance.now();
      let last = start;

      function loop(t) {
        state.frames.push(t - last);
        last = t;
        if (t - start < recordMs) requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);

      try {
        const po = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) state.longTaskDurations.push(e.duration);
        });
        po.observe({ type: 'longtask', buffered: false });
        state.__po = po;
      } catch {
        /* longtask 미지원 브라우저 — 무시 */
      }

      if (boardOn) {
        const el = document.querySelector('.toolbar__count');
        const parseCommitId = (text) => {
          const m = /커밋 #(\d+)/.exec(text ?? '');
          return m ? Number(m[1]) : null;
        };
        state.startCommitId = parseCommitId(el?.textContent);
        if (el) {
          const mo = new MutationObserver(() => {
            state.mutationCount += 1;
            state.endCommitId = parseCommitId(el.textContent);
          });
          mo.observe(el, { characterData: true, childList: true, subtree: true });
          state.__mo = mo;
        }
      }
    },
    { recordMs: RECORD_MS, boardOn },
  );

  // 관찰 창 안에서 host 앱 상호작용(Counter 연타) 응답 시간을 측정한다.
  const counterButton = page.getByRole('button', { name: /^count is/ });
  const clickT0 = Date.now();
  const CLICKS = 10;
  for (let i = 0; i < CLICKS; i++) {
    await counterButton.click();
  }
  const clickMs = Date.now() - clickT0;

  const remaining = RECORD_MS - (Date.now() - clickT0) - WARMUP_MS;
  if (remaining > 0) await page.waitForTimeout(remaining);
  else await page.waitForTimeout(50);

  const raw = await page.evaluate(() => {
    const state = window.__rrb;
    state.__po?.disconnect();
    state.__mo?.disconnect();
    return {
      frames: state.frames,
      longTaskDurations: state.longTaskDurations,
      mutationCount: state.mutationCount,
      startCommitId: state.startCommitId,
      endCommitId: state.endCommitId,
    };
  });

  const fStats = frameStats(raw.frames);
  const commitsInWindow =
    boardOn && raw.startCommitId != null && raw.endCommitId != null ? raw.endCommitId - raw.startCommitId : null;
  const avgBatchSize =
    commitsInWindow != null && raw.mutationCount > 0 ? commitsInWindow / raw.mutationCount : null;

  return {
    hz,
    boardOn,
    clickMs,
    frame: fStats,
    longTaskCount: raw.longTaskDurations.length,
    longTaskTotalMs: raw.longTaskDurations.reduce((a, b) => a + b, 0),
    commitsInWindow,
    reRenderCount: boardOn ? raw.mutationCount : null,
    avgBatchSize,
  };
}

async function runStepwise(browser) {
  const results = [];
  for (const boardOn of [true, false]) {
    const url = boardOn ? BASE_URL : `${BASE_URL}?board=off`;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=live feed', { timeout: 5000 });

    for (const hz of FREQUENCIES) {
      const runs = [];
      for (let i = 0; i < REPEATS; i++) {
        runs.push(await measureAtFrequency(page, hz, boardOn));
      }
      const r = {
        hz,
        boardOn,
        clickMs: Math.round(median(runs.map((x) => x.clickMs))),
        clickMsRange: [Math.min(...runs.map((x) => x.clickMs)), Math.max(...runs.map((x) => x.clickMs))],
        frame: {
          avgFps: median(runs.map((x) => x.frame.avgFps)),
          over32ms: median(runs.map((x) => x.frame.over32ms)),
          over50ms: median(runs.map((x) => x.frame.over50ms)),
          maxMs: median(runs.map((x) => x.frame.maxMs)),
        },
        longTaskCount: Math.round(median(runs.map((x) => x.longTaskCount))),
        longTaskTotalMs: median(runs.map((x) => x.longTaskTotalMs)),
        commitsInWindow: boardOn ? Math.round(median(runs.map((x) => x.commitsInWindow))) : null,
        reRenderCount: boardOn ? Math.round(median(runs.map((x) => x.reRenderCount))) : null,
        avgBatchSize: boardOn ? median(runs.map((x) => x.avgBatchSize)) : null,
      };
      results.push(r);
      console.log(
        `[verify-hf] board=${boardOn ? 'on ' : 'off'} hz=${String(hz).padStart(3)} ` +
          `| click(10x) median=${String(r.clickMs).padStart(4)}ms [${r.clickMsRange[0]}-${r.clickMsRange[1]}] | fps=${fmt(r.frame.avgFps)} ` +
          `| >32ms=${fmt(r.frame.over32ms)}% >50ms=${fmt(r.frame.over50ms)}% maxFrame=${fmt(r.frame.maxMs, 0)}ms ` +
          `| longtask=${r.longTaskCount}(${fmt(r.longTaskTotalMs, 0)}ms) ` +
          (boardOn
            ? `| commits=${r.commitsInWindow} reRenders=${r.reRenderCount} avgBatch=${fmt(r.avgBatchSize, 2)}`
            : '| (board off — 커밋/배치 관찰 대상 아님)'),
      );
    }

    console.log(`[verify-hf] board=${boardOn ? 'on' : 'off'} 세션 콘솔/페이지 에러: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) console.log('[verify-hf] 에러 내용:', consoleErrors.slice(0, 10));

    await page.close();
  }

  console.log('\n[verify-hf] === 응답성 배율 (board on / board off, Counter 10회 연타) ===');
  for (const hz of FREQUENCIES) {
    const on = results.find((r) => r.hz === hz && r.boardOn);
    const off = results.find((r) => r.hz === hz && !r.boardOn);
    const ratio = on && off && off.clickMs > 0 ? on.clickMs / off.clickMs : NaN;
    console.log(`[verify-hf] hz=${hz}: ${off?.clickMs}ms(닫힘) -> ${on?.clickMs}ms(열림) = ${fmt(ratio, 2)}배`);
  }

  return results;
}

// 대표 Hz로 5분 이상 지속 실행하며 CDP Performance.getMetrics()의 힙 사용량을 샘플링한다.
async function runMemorySoak(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=live feed', { timeout: 5000 });

  const client = await page.context().newCDPSession(page);
  await client.send('Performance.enable');
  await client.send('HeapProfiler.enable');

  // 진단용 하트비트: rAF가 실제로 계속 도는지(브라우저 백그라운드 탭 타이머 스로틀링으로
  // 멈춘 건 아닌지)를 메모리 지표와 나란히 확인하기 위한 계측. window.__rrbHeartbeat를
  // 매 프레임 증가시키고, 샘플마다 델타(=그 구간 동안 실제로 실행된 프레임 수)를 읽는다.
  await page.evaluate(() => {
    window.__rrbHeartbeat = 0;
    function tick() {
      window.__rrbHeartbeat += 1;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  await page.getByRole('button', { name: `${MEMORY_SOAK_HZ}Hz 시작` }).click();
  console.log(
    `\n[verify-hf] === 메모리 소크 테스트: board=on, ${MEMORY_SOAK_HZ}Hz, ${(MEMORY_SOAK_MS / 1000 / 60).toFixed(1)}분 ===`,
  );

  const samples = [];
  const soakStart = Date.now();
  while (Date.now() - soakStart < MEMORY_SOAK_MS) {
    await page.waitForTimeout(MEMORY_SAMPLE_INTERVAL_MS);
    await client.send('HeapProfiler.collectGarbage');
    const { metrics } = await client.send('Performance.getMetrics');
    const get = (name) => metrics.find((m) => m.name === name)?.value;
    const diag = await page.evaluate(() => {
      const heartbeat = window.__rrbHeartbeat;
      window.__rrbHeartbeat = 0;
      const statusText = document.querySelector('[data-testid="live-feed-status"]')?.textContent ?? '';
      const tickMatch = /tick (\d+)/.exec(statusText);
      return {
        heartbeat,
        visibilityState: document.visibilityState,
        hidden: document.hidden,
        tick: tickMatch ? Number(tickMatch[1]) : null,
      };
    });
    const sample = {
      tSec: Math.round((Date.now() - soakStart) / 1000),
      heapMB: get('JSHeapUsedSize') / (1024 * 1024),
      nodes: get('Nodes'),
      documents: get('Documents'),
      listeners: get('JSEventListeners'),
      ...diag,
    };
    samples.push(sample);
    console.log(
      `[verify-hf] t=${String(sample.tSec).padStart(4)}s | heap=${fmt(sample.heapMB, 2)}MB | ` +
        `domNodes=${sample.nodes} | listeners=${sample.listeners} | rAF프레임/구간=${sample.heartbeat} | ` +
        `tick=${sample.tick} | visibility=${sample.visibilityState}(hidden=${sample.hidden})`,
    );
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const heapGrowthMB = last.heapMB - first.heapMB;
  const nodeGrowth = last.nodes - first.nodes;
  console.log(
    `[verify-hf] 힙 변화: ${fmt(first.heapMB, 2)}MB -> ${fmt(last.heapMB, 2)}MB (${heapGrowthMB >= 0 ? '+' : ''}${fmt(heapGrowthMB, 2)}MB), ` +
      `DOM 노드 변화: ${first.nodes} -> ${last.nodes} (${nodeGrowth >= 0 ? '+' : ''}${nodeGrowth})`,
  );
  console.log(`[verify-hf] 메모리 소크 세션 콘솔/페이지 에러: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) console.log('[verify-hf] 에러 내용:', consoleErrors.slice(0, 10));

  await page.close();
  return { samples, heapGrowthMB, nodeGrowth };
}

async function main() {
  const browser = await chromium.launch();

  if (!SKIP_STEPWISE) {
    console.log('[verify-hf] === 1단계: Hz별 배치 효과 / 프레임 드랍 / 응답성 ===');
    await runStepwise(browser);
  } else {
    console.log('[verify-hf] SKIP_STEPWISE=1 — 1단계 생략');
  }

  if (!SKIP_MEMORY_SOAK) {
    await runMemorySoak(browser);
  } else {
    console.log('[verify-hf] SKIP_MEMORY_SOAK=1 — 메모리 소크 테스트 생략');
  }

  await browser.close();
  console.log('[verify-hf] 완료.');
}

main().catch((err) => {
  console.error('[verify-hf] 실패', err);
  process.exit(1);
});
