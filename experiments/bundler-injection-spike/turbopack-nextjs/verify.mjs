// Turbopack/Next.js 스파이크 검증 스크립트.
// 이 repo의 scripts/verify.mjs 패턴을 참고해, dev 서버를 직접 백그라운드로 띄우고
// Playwright headless Chromium으로 접속해 계측 스크립트(instrumentation-client.ts)가
// 실제로 동작하는지 확인한다.
//
// 확인하는 것:
// 1. instrumentation-client.ts가 실행되어 window.__RRB_INJECTED__ = true가 설정되는가.
// 2. #rrb-floating-button이 DOM에 마운트되고 실제로 보이는가.
// 3. __REACT_DEVTOOLS_GLOBAL_HOOK__ 스텁이 React가 그것을 체크하기 전에 설치되어,
//    React가 실제로 inject()를 호출하고 커밋마다 onCommitFiberRoot를 호출하는가
//    (= 단순히 훅 객체가 존재하는 것과, React가 실제로 그걸 사용하는 것은 다르다 —
//    타이밍이 늦으면 훅은 있지만 React는 그걸 발견 못하고 지나간 뒤라 아무 일도 안 일어난다).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = 5304;
const BASE_URL = `http://localhost:${PORT}`;
const OUT_DIR = fileURLToPath(new URL('./verify-output/', import.meta.url));
const outPath = (name) => path.join(OUT_DIR, name);

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (data) => {
      buf += data.toString();
      process.stdout.write(`[dev] ${data}`);
      if (/Ready in/i.test(buf) || /✓ Ready/.test(buf)) {
        cleanup();
        resolve();
      }
    };
    const onErr = (data) => {
      process.stderr.write(`[dev:err] ${data}`);
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`dev server exited early with code ${code}`));
    };
    function cleanup() {
      child.stdout.off('data', onData);
      child.stderr.off('data', onErr);
      child.off('exit', onExit);
    }
    child.stdout.on('data', onData);
    child.stderr.on('data', onErr);
    child.on('exit', onExit);
    setTimeout(() => {
      cleanup();
      reject(new Error('timed out waiting for dev server to become ready'));
    }, 60_000);
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`[verify] starting dev server on port ${PORT}...`);
  const devServer = spawn('npm', ['run', 'dev', '--', '--port', String(PORT)], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  console.log(`[verify] dev server PID: ${devServer.pid}`);

  let browser;
  let result = 'FAIL';
  const consoleLines = [];

  try {
    await waitForReady(devServer);
    // Turbopack이 준비 배너를 찍은 직후에도 첫 컴파일이 아직 진행 중일 수 있어 약간의 여유를 둔다.
    await new Promise((r) => setTimeout(r, 800));

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[rrb-spike]')) {
        consoleLines.push(text);
        console.log('[browser console]', text);
      }
    });
    page.on('pageerror', (err) => {
      console.log('[browser pageerror]', String(err));
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const injected = await page.evaluate(() => (window).__RRB_INJECTED__ === true);
    console.log(`[verify] window.__RRB_INJECTED__ === true: ${injected}`);

    await page.waitForSelector('#rrb-floating-button', { state: 'visible', timeout: 5000 });
    console.log('[verify] #rrb-floating-button is visible: true');

    await page.screenshot({ path: outPath('floating-button.png') });
    console.log(`[verify] screenshot saved to ${outPath('floating-button.png')}`);

    // 커밋을 유도하기 위해 페이지를 살짝 리로드/재상호작용 시도 없이도, 초기 마운트 자체가
    // 이미 최소 1회의 root 커밋이다 — onCommitFiberRoot가 안 찍히면 훅이 너무 늦게
    // 설치되었다는 뜻.
    await page.waitForTimeout(500);

    const fired = consoleLines.some((l) => l.includes('onCommitFiberRoot fired!'));
    const injectCalled = consoleLines.some((l) => l.includes('renderer injected, id='));
    const stubCreated = consoleLines.some((l) =>
      l.includes('created __REACT_DEVTOOLS_GLOBAL_HOOK__ stub')
    );

    console.log(`[verify] hook stub created (no pre-existing hook): ${stubCreated}`);
    console.log(`[verify] React called inject() on our stub: ${injectCalled}`);
    console.log(`[verify] onCommitFiberRoot fired at least once: ${fired}`);
    console.log('[verify] full [rrb-spike] console log order:');
    consoleLines.forEach((l, i) => console.log(`  ${i}: ${l}`));

    if (injected && fired && injectCalled) {
      result = 'PASS';
    } else {
      result = 'FAIL';
    }
  } catch (err) {
    console.error('[verify] error during verification:', err);
    result = 'FAIL';
  } finally {
    if (browser) await browser.close();
    console.log('[verify] killing dev server...');
    try {
      process.kill(-devServer.pid, 'SIGTERM');
    } catch {
      try {
        devServer.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n[verify] RESULT: ${result}`);
  if (result === 'FAIL') process.exitCode = 1;
}

main();
