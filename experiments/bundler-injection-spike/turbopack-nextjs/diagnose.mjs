// 진단 전용 스크립트 (verify.mjs 아님) — 왜 instrumentation-client.ts가 실행되는 시점에
// __REACT_DEVTOOLS_GLOBAL_HOOK__이 "이미 존재"하는지 원인을 찾기 위한 것.
// addInitScript로 document_start 시점(=페이지의 어떤 스크립트보다도 먼저)에 개입해,
// window.__REACT_DEVTOOLS_GLOBAL_HOOK__에 누가 언제 값을 쓰는지 setter를 통해 가로챈다.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = 5304;
const BASE_URL = `http://localhost:${PORT}`;

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (data) => {
      buf += data.toString();
      process.stdout.write(`[dev] ${data}`);
      if (/Ready in/i.test(buf)) {
        cleanup();
        resolve();
      }
    };
    function cleanup() {
      child.stdout.off('data', onData);
    }
    child.stdout.on('data', onData);
    setTimeout(() => {
      cleanup();
      reject(new Error('timeout'));
    }, 60_000);
  });
}

async function main() {
  const devServer = spawn('npm', ['run', 'dev', '--', '--port', String(PORT)], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  try {
    await waitForReady(devServer);
    await new Promise((r) => setTimeout(r, 800));

    const browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('console', (msg) => console.log('[console]', msg.text()));

    await page.addInitScript(() => {
      let _val;
      Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
        configurable: true,
        get() {
          return _val;
        },
        set(v) {
          console.log(
            '[diag] __REACT_DEVTOOLS_GLOBAL_HOOK__ SET at t=',
            performance.now(),
            'readyState=',
            document.readyState,
            'value has inject=',
            !!(v && v.inject)
          );
          _val = v;
        },
      });
      console.log('[diag] addInitScript ran at t=', performance.now(), 'readyState=', document.readyState);
      document.addEventListener('readystatechange', () => {
        console.log('[diag] readystatechange ->', document.readyState, 'at t=', performance.now());
      });
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await browser.close();
  } finally {
    try {
      process.kill(-devServer.pid, 'SIGTERM');
    } catch {
      devServer.kill();
    }
  }
}

main();
