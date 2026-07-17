// Vite dev-server 주입 스파이크 검증 스크립트.
// scripts/verify.mjs(레포 루트)의 패턴을 참고했지만, 이 스크립트는 dev 서버 자체를
// 직접 띄우고 죽이는 라이프사이클까지 관리한다(레포 루트 버전은 이미 떠 있는 서버를 가정함).
//
// 확인하는 것:
// 1. `npm run dev -- --port 5301`로 뜬 dev 서버가 실제로 우리 플러그인이 주입한
//    <script>가 포함된 HTML을 서빙하는가.
// 2. 그 스크립트가 실행되어 #rrb-floating-button이 DOM에 보이는가.
// 3. __REACT_DEVTOOLS_GLOBAL_HOOK__ 스텁이 실제 React 커밋을 관찰하는가
//    (onCommitFiberRoot fired! 로그가 최소 1회 이상 찍히는가) — 단순히 훅 객체가
//    존재하는 것만으로는 부족하고, React가 실제로 그 훅을 호출했는지까지 증명해야 한다.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = 5301;
const BASE_URL = `http://localhost:${PORT}`;
const OUT_DIR = fileURLToPath(new URL('./verify-output/', import.meta.url));
const outPath = (name) => path.join(OUT_DIR, name);
const CWD = fileURLToPath(new URL('.', import.meta.url));

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`dev 서버가 ${timeoutMs}ms 안에 준비되지 않음: ${url}`));
          return;
        }
        setTimeout(attempt, 300);
      });
    }
    attempt();
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`[verify] dev 서버 기동 중 (port ${PORT})...`);
  const devServer = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], {
    cwd: CWD,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // 자식 프로세스 그룹 분리 -> 나중에 그룹째 kill 가능
  });
  let serverLog = '';
  devServer.stdout.on('data', (d) => (serverLog += d.toString()));
  devServer.stderr.on('data', (d) => (serverLog += d.toString()));

  let exitCode = null;
  devServer.on('exit', (code) => {
    exitCode = code;
  });

  function killServer() {
    if (devServer.pid && exitCode === null) {
      try {
        process.kill(-devServer.pid, 'SIGTERM'); // 프로세스 그룹 전체 종료
      } catch (err) {
        console.log('[verify] 서버 종료 중 경고:', err.message);
      }
    }
  }

  try {
    await waitForServer(BASE_URL);
    console.log(`[verify] dev 서버 PID=${devServer.pid}, 준비 완료.`);

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    const rrbLogs = [];
    const allConsole = [];
    page.on('console', (msg) => {
      const text = msg.text();
      allConsole.push(`[${msg.type()}] ${text}`);
      if (text.includes('[rrb-spike]')) rrbLogs.push(text);
    });
    page.on('pageerror', (err) => allConsole.push(`[pageerror] ${String(err)}`));

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // React가 마운트되고 최소 1회 커밋이 일어날 시간을 준다.
    await page.waitForTimeout(500);

    await page.waitForSelector('#rrb-floating-button', { state: 'visible', timeout: 5000 });
    console.log('[verify] #rrb-floating-button DOM에 보임: true');

    await page.screenshot({ path: outPath('floating-button.png') });
    console.log(`[verify] 스크린샷 저장: ${outPath('floating-button.png')}`);

    const injectedFlag = await page.evaluate(() => window.__RRB_INJECTED__ === true);
    const hookExists = await page.evaluate(() => typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ === 'object');

    console.log('[verify] window.__RRB_INJECTED__ === true:', injectedFlag);
    console.log('[verify] __REACT_DEVTOOLS_GLOBAL_HOOK__ 존재:', hookExists);
    console.log('[verify] 캡처된 [rrb-spike] 콘솔 로그:');
    rrbLogs.forEach((l) => console.log('    ' + l));

    const commitFired = rrbLogs.some((l) => l.includes('onCommitFiberRoot fired!'));
    const hookCreated = rrbLogs.some((l) => l.includes('created __REACT_DEVTOOLS_GLOBAL_HOOK__ stub'));

    await browser.close();

    console.log('\n========== 검증 결과 ==========');
    console.log(`  스크립트 주입/실행 (__RRB_INJECTED__): ${injectedFlag ? 'PASS' : 'FAIL'}`);
    console.log(`  플로팅 버튼 렌더링:                    PASS (waitForSelector 통과)`);
    console.log(`  DevTools 훅 스텁 생성:                  ${hookCreated ? 'PASS' : 'FAIL'}`);
    console.log(`  실제 React 커밋 관찰(onCommitFiberRoot): ${commitFired ? 'PASS' : 'FAIL'}`);

    const overallPass = injectedFlag && hookCreated && commitFired;
    console.log(`\n  종합: ${overallPass ? 'PASS' : 'FAIL'}`);
    console.log('================================\n');

    if (!overallPass) {
      console.log('[verify] 전체 콘솔 로그 덤프 (디버깅용):');
      allConsole.forEach((l) => console.log('    ' + l));
      console.log('[verify] dev 서버 로그 덤프:');
      console.log(serverLog);
    }

    killServer();
    process.exitCode = overallPass ? 0 : 1;
  } catch (err) {
    console.error('[verify] 실패:', err);
    console.log('[verify] dev 서버 로그 덤프:');
    console.log(serverLog);
    killServer();
    process.exitCode = 1;
  }
}

main();
