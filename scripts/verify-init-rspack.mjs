// Rspack 실제 캔버스 — withRenderBoard 헬퍼 end-to-end 실측 (ADR-0021/0036/0072).
//
// 소비자 플로우 재현: 라이브러리 패키징(npm pack) → Rspack 스파이크에 설치(deps 동반) →
// 깨끗한 CJS rspack.config.js를 실제 `init`이 withRenderBoard로 자동 래핑하는지 확인하고 →
// `rspack dev`로 (1) html-webpack-plugin beforeEmit 경유 조기 <head> 스크립트가 앱 무수정으로
// 훅을 걸고 (2) 런타임 entry가 실제 BoardOverlay+React Flow 캔버스를 띄우는지 확인한다.
//
// Rspack 고유 위험(ADR-0021 실측): 내장 HtmlRspackPlugin은 html-webpack-plugin과 훅이 달라
// 조기 스크립트가 안 들어간다 — 이 스파이크는 html-webpack-plugin을 쓰므로(스파이크 검증과 동일
// 조건) beforeEmit 경로가 Rspack의 webpack 호환 레이어에서 실제로 동작하는지가 검증 포인트다.
//
// 스파이크의 원래 config는 ESM/TS(rspack.config.ts)라 `init`이 수동 안내로 폴백한다 — 여기서는
// 자동 패치 경로를 실측하려고 .ts를 잠시 옆으로 치우고 CJS .js를 쓴 뒤 finally에서 원상복구한다.
//
// 실행: node scripts/verify-init-rspack.mjs (npm run verify:init-rspack)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, renameSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scaffold = path.join(repoRoot, 'experiments/bundler-injection-spike/rspack');
const tsConfigPath = path.join(scaffold, 'rspack.config.ts');
const tsConfigAside = path.join(scaffold, 'rspack.config.ts.rrb-matrix-bak');
const cjsConfigPath = path.join(scaffold, 'rspack.config.js');
const mainPath = path.join(scaffold, 'src/main.tsx');
const appPath = path.join(scaffold, 'src/App.tsx');
const pkgPath = path.join(scaffold, 'package.json');
const lockPath = path.join(scaffold, 'package-lock.json');
const cliBin = path.join(repoRoot, 'cli/bin.mjs');
const PORT = 5313;

// 깨끗한 CJS 객체 config(withRenderBoard 없음) — 실제 `init`이 이걸 자동 패치하는지 실측한다.
// 스파이크의 rspack.config.ts에서 검증에 불필요한 것(react-refresh, 자체 스텁 플러그인)만 뺀 형태.
const CLEAN_CONFIG = `const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: { main: './src/main.tsx' },
  resolve: { extensions: ['...', '.ts', '.tsx', '.jsx'] },
  module: {
    rules: [
      { test: /\\.svg$/, type: 'asset' },
      { test: /\\.css$/, type: 'css/auto' },
      {
        test: /\\.(?:js|jsx|ts|tsx)$/,
        use: [{ loader: 'builtin:swc-loader', options: { jsc: { transform: { react: { runtime: 'automatic', development: true } } } } }],
      },
    ],
  },
  plugins: [new HtmlWebpackPlugin({ template: './index.html' })],
  devServer: { port: ${PORT}, host: 'localhost', open: false, hot: false },
  devtool: 'eval-source-map',
};
`;

let failed = false;
const fail = (m) => { console.error(`\x1b[31m✗ ${m}\x1b[0m`); failed = true; };
const pass = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);

function sh(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { out += d; });
    c.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args.join(' ')} exit ${code}\n${out.slice(-700)}`))));
  });
}
function waitReady(child) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (d) => { buf += d.toString(); if (/compiled successfully|Local:\s+http:\/\/localhost/i.test(buf)) resolve(); };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (c) => reject(new Error(`rspack dev exited ${c}\n${buf.slice(-700)}`)));
    setTimeout(() => reject(new Error('rspack 준비 타임아웃(120s)')), 120_000);
  });
}

const originalPkg = readFileSync(pkgPath, 'utf8');
const originalLock = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : null;
const mainBefore = readFileSync(mainPath, 'utf8');
const appBefore = readFileSync(appPath, 'utf8');
let tgz, dev, browser, movedTsConfig = false;

async function main() {
  console.log('\x1b[1m── react-render-board withRenderBoard end-to-end (Rspack) ──\x1b[0m');
  if (!existsSync(path.join(scaffold, 'node_modules', '@rspack'))) {
    console.log('\x1b[33m! Rspack 스파이크 node_modules 없음 — 건너뜁니다.\x1b[0m'); return;
  }

  try {
    if (process.env.RRB_SKIP_BUILD === '1' && existsSync(path.join(repoRoot, 'dist-lib/inject.js'))) {
      console.log('[e2e] build:lib 건너뜀(RRB_SKIP_BUILD=1, 기존 dist-lib 재사용).');
    } else {
      console.log('[e2e] build:lib …'); await sh('npm', ['run', 'build:lib'], repoRoot);
    }
    const packOut = await sh('npm', ['pack', '--json'], repoRoot);
    tgz = path.join(repoRoot, JSON.parse(packOut.slice(packOut.indexOf('[')))[0].filename);
    pass(`패키징 완료: ${path.basename(tgz)}`);

    console.log('[e2e] 스파이크에 설치 …');
    await sh('npm', ['install', tgz, '--legacy-peer-deps', '--no-audit', '--no-fund'], scaffold);
    pass('react-render-board 설치 완료(+deps).');

    // 원래 ESM/TS config를 치우고 깨끗한 CJS config를 둔 뒤, 실제 `init`으로 자동 패치.
    // (detectBundler와 rspack CLI 둘 다 .ts를 우선 집으므로 옆으로 치워야 .js 경로를 탄다.)
    renameSync(tsConfigPath, tsConfigAside); movedTsConfig = true;
    writeFileSync(cjsConfigPath, CLEAN_CONFIG);
    const initOut = await sh('node', [cliBin, 'init'], scaffold);
    if (/wrapped-cjs/.test(initOut) && /withRenderBoard/.test(readFileSync(cjsConfigPath, 'utf8'))) {
      pass('`init`이 rspack.config.js를 자동 패치(withRenderBoard 래핑).');
    } else { fail('init이 rspack.config.js를 자동 패치 못 함.'); console.log(initOut); }

    console.log(`[e2e] rspack dev (port ${PORT}) …`);
    dev = spawn('npm', ['run', 'dev'], { cwd: scaffold, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    await waitReady(dev);
    await new Promise((r) => setTimeout(r, 1500));

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const toggle = page.locator('.board-toggle-group').getByRole('button', { name: 'render-board 열기' });
    await toggle.waitFor({ state: 'visible', timeout: 15000 });
    const booted = await page.evaluate(() => window.__RRB_BOOTED__ === true);
    const commits = await page.evaluate(() => window.__RRB_COMMITS__ || 0);
    if (booted) pass('실제 보드 런타임 부팅됨(__RRB_BOOTED__).');
    else fail('런타임 부팅 안 됨(스텁 버튼만).');
    // Rspack 고유 검증 포인트: html-webpack-plugin beforeEmit 경유 조기 스크립트가
    // Rspack의 webpack 호환 레이어에서도 실제로 <head>에 들어가 초기 커밋을 버퍼링했는가.
    if (commits > 0) pass(`조기 훅이 초기 커밋 관찰(onCommitFiberRoot ${commits}회) — beforeEmit 경로가 Rspack에서 동작.`);
    else fail('onCommitFiberRoot 0 — 조기 <head> 스크립트가 Rspack에서 주입 안 됨(HtmlRspackPlugin 훅 비호환 의심).');

    // CSS 자기주입(ADR-0069) — 런타임이 <style>로 직접 주입하므로 로더 구성 무관해야 한다.
    const fabRadius = await page.evaluate(() => {
      const el = document.querySelector('.board-fab');
      return el ? getComputedStyle(el).borderRadius : null;
    });
    if (fabRadius === '50%') pass('CSS 자기주입 동작(.board-fab 스타일 적용).');
    else fail(`CSS 자기주입 실패(.board-fab border-radius=${fabRadius}).`);

    await toggle.click();
    await page.waitForSelector('.react-flow__node', { timeout: 12000 });
    const nodes = await page.locator('.react-flow__node').count();
    if (nodes > 0) pass(`실제 React Flow 캔버스 — 앱 트리 노드 ${nodes}개(Rspack에서 보드 동작!).`);
    else fail('캔버스 노드 0.');
    mkdirSync(path.join(repoRoot, 'verify-output/matrix'), { recursive: true });
    await page.screenshot({ path: path.join(repoRoot, 'verify-output/matrix/rspack.png') }).catch(() => {});

    if (readFileSync(mainPath, 'utf8') === mainBefore && readFileSync(appPath, 'utf8') === appBefore) {
      pass('앱 소스(src/main.tsx·src/App.tsx) 무수정.');
    } else fail('앱 소스가 변경됨.');

    const realErrors = errors.filter((e) => !/Download the React DevTools|Warning:|favicon/.test(e));
    if (realErrors.length === 0) pass('치명적 콘솔 에러 0.');
    else { realErrors.slice(0, 5).forEach((e) => console.log('   ', e.slice(0, 200))); fail(`콘솔 에러 ${realErrors.length}건.`); }
  } catch (e) {
    fail(String(e && e.message ? e.message : e));
  } finally {
    if (browser) await browser.close();
    if (dev) { try { process.kill(-dev.pid, 'SIGTERM'); } catch { try { dev.kill('SIGTERM'); } catch {} } await new Promise((r) => setTimeout(r, 500)); }
    try { rmSync(cjsConfigPath, { force: true }); } catch {}
    if (movedTsConfig) try { renameSync(tsConfigAside, tsConfigPath); } catch {}
    writeFileSync(pkgPath, originalPkg);
    if (originalLock !== null) writeFileSync(lockPath, originalLock);
    for (const f of readdirSync(repoRoot)) if (/^react-render-board-.*\.tgz$/.test(f)) try { rmSync(path.join(repoRoot, f), { force: true }); } catch {}
    console.log('[e2e] 스파이크 원상복구 완료.');
  }
  if (failed) { console.error('\x1b[31m검증 실패.\x1b[0m'); process.exitCode = 1; }
  else console.log('\x1b[32m모든 검증 통과.\x1b[0m');
}

main().catch((e) => { console.error(e); process.exit(1); });
