// Spike verification script for the Rspack + unmodified-webpack-plugin injection test.
//
// What this proves:
// 1. The Rspack dev server (port 5303) starts and serves the app.
// 2. The HTML response contains the script injected by the byte-for-byte-unmodified
//    webpack plugin `rrb-inject-plugin.js` (via html-webpack-plugin's beforeEmit hook).
// 3. The injected script actually executes in the browser: the floating `#rrb-floating-button`
//    mounts, and the React DevTools global hook stub receives a real `onCommitFiberRoot` call
//    when React 19 commits the fiber tree — proving Fiber-hook access works end to end.
//
// Usage: node verify.mjs   (spawns its own dev server on 5303, no need to start one yourself)

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = 5303;
const BASE_URL = `http://localhost:${PORT}`;
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const OUT_DIR = path.join(ROOT, 'verify-output');

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch {
        // not up yet
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Timed out waiting for ${url}`));
      }
      setTimeout(tick, 300);
    };
    tick();
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log('[verify] starting rspack dev server on port', PORT, '...');
  const devServer = spawn('npm', ['run', 'dev'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // own process group so we can kill the whole tree (rspack dev spawns children)
  });
  console.log('[verify] dev server PID:', devServer.pid);

  let serverLog = '';
  devServer.stdout.on('data', (d) => (serverLog += d.toString()));
  devServer.stderr.on('data', (d) => (serverLog += d.toString()));

  let exitCode = null;
  devServer.on('exit', (code) => {
    exitCode = code;
  });

  const killServer = () => {
    if (devServer.pid) {
      try {
        process.kill(-devServer.pid, 'SIGKILL'); // negative pid = whole process group
      } catch {
        try {
          devServer.kill('SIGKILL');
        } catch {
          // already dead
        }
      }
    }
  };

  let pass = true;
  const failReasons = [];

  try {
    await waitForServer(BASE_URL);
    console.log('[verify] dev server is up.');

    if (exitCode !== null) {
      throw new Error(`dev server exited early with code ${exitCode}. Log:\n${serverLog}`);
    }

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    const rrbConsoleMessages = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[rrb-spike]')) {
        rrbConsoleMessages.push(text);
        console.log('[browser console]', text);
      }
    });
    page.on('pageerror', (err) => {
      console.log('[browser pageerror]', String(err));
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Confirm the injected floating button mounted (proves the plugin's <script> ran).
    const button = page.locator('#rrb-floating-button');
    await button.waitFor({ state: 'visible', timeout: 5000 });
    const buttonVisible = await button.isVisible();
    console.log('[verify] #rrb-floating-button visible:', buttonVisible);
    if (!buttonVisible) {
      pass = false;
      failReasons.push('#rrb-floating-button did not become visible');
    }

    // Give React a moment to mount + commit (initial render should already have fired
    // onCommitFiberRoot by the time networkidle settles, but be generous).
    await page.waitForTimeout(500);

    // Trigger a real React state update/commit via the scaffold's own counter button
    // ("count is N"), so onCommitFiberRoot fires again beyond the initial mount commit.
    const counterButton = page.getByRole('button', { name: /count is/ });
    await counterButton.click().catch(() => {});
    await counterButton.click().catch(() => {});
    await page.waitForTimeout(300);

    await page.screenshot({ path: path.join(OUT_DIR, 'floating-button.png') });
    console.log('[verify] screenshot saved to verify-output/floating-button.png');

    const hookCreated = rrbConsoleMessages.some((m) =>
      m.includes('created __REACT_DEVTOOLS_GLOBAL_HOOK__ stub')
    );
    const rendererInjected = rrbConsoleMessages.some((m) => m.includes('renderer injected'));
    const commitFired = rrbConsoleMessages.some((m) => m.includes('onCommitFiberRoot fired!'));

    console.log('[verify] hook stub created:', hookCreated);
    console.log('[verify] renderer injected (React attached to the fake devtools hook):', rendererInjected);
    console.log('[verify] onCommitFiberRoot fired at least once:', commitFired);

    if (!hookCreated) {
      pass = false;
      failReasons.push('__REACT_DEVTOOLS_GLOBAL_HOOK__ stub creation log never appeared');
    }
    if (!rendererInjected) {
      pass = false;
      failReasons.push('React never called hook.inject(renderer) — hook was not seen by React');
    }
    if (!commitFired) {
      pass = false;
      failReasons.push('onCommitFiberRoot never fired — Fiber commit hook access failed');
    }

    await browser.close();
  } catch (err) {
    pass = false;
    failReasons.push(String(err && err.stack ? err.stack : err));
  } finally {
    killServer();
  }

  console.log('\n=== RESULT ===');
  if (pass) {
    console.log('PASS: unmodified webpack plugin injected script + Fiber hook access confirmed under Rspack.');
  } else {
    console.log('FAIL:');
    for (const reason of failReasons) console.log(' -', reason);
  }
  process.exit(pass ? 0 : 1);
}

main();
