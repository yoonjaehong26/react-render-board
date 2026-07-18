// webpack 실제 캔버스 — withRenderBoard 헬퍼 end-to-end 실측 (ADR-0021/0036).
//
// 소비자 플로우 재현: 라이브러리 패키징(npm pack) → webpack 스파이크에 설치(deps 동반) →
// webpack.config를 withRenderBoard로 감싸고 → webpack serve로 (1) 조기 <head> 스크립트가
// 앱 무수정으로 훅을 걸고 (2) 런타임 entry가 실제 BoardOverlay+React Flow 캔버스를 띄우는지
// 확인한다. 끝나면 스파이크(config/package.json/lock)를 원상복구.
//
// webpack 스파이크엔 css-loader가 없다 — 그래서 이 스파이크는 "런타임 CSS 자기주입"(ADR-0069,
// src/inject.tsx가 CSS를 문자열로 품고 <style>로 주입)의 결정적 검증 무대다: 로더가 전혀
// 없는데도 보드가 스타일을 갖춰야 한다(아래 .board-fab computed style 단언).
//
// 실행: node scripts/verify-init-webpack.mjs (npm run verify:init-webpack)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scaffold = path.join(repoRoot, 'experiments/bundler-injection-spike/webpack');
const configPath = path.join(scaffold, 'webpack.config.js');
const indexPath = path.join(scaffold, 'src/index.tsx');
const pkgPath = path.join(scaffold, 'package.json');
const lockPath = path.join(scaffold, 'package-lock.json');
const cliBin = path.join(repoRoot, 'cli/bin.mjs');
const PORT = 5312;

// 깨끗한 CJS 객체 config(withRenderBoard 없음) — 실제 `init`이 이걸 자동 패치하는지 실측한다.
const CLEAN_CONFIG = `const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: './src/index.tsx',
  output: { path: path.resolve(__dirname, 'dist'), filename: 'bundle.js', clean: true },
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: { rules: [{ test: /\\.tsx?$/, use: { loader: 'ts-loader', options: { transpileOnly: true } }, exclude: /node_modules/ }] },
  plugins: [new HtmlWebpackPlugin({ template: './public/index.html' })],
  devServer: { static: { directory: path.resolve(__dirname, 'public') }, port: ${PORT}, host: 'localhost', open: false, hot: false },
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
    const onData = (d) => { buf += d.toString(); if (/compiled successfully|compiled with warnings|Project is running/i.test(buf)) resolve(); };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (c) => reject(new Error(`webpack serve exited ${c}\n${buf.slice(-700)}`)));
    setTimeout(() => reject(new Error('webpack 준비 타임아웃(120s)')), 120_000);
  });
}

const originalConfig = readFileSync(configPath, 'utf8');
const originalPkg = readFileSync(pkgPath, 'utf8');
const originalLock = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : null;
const indexBefore = readFileSync(indexPath, 'utf8');
let tgz, dev, browser;

async function main() {
  console.log('\x1b[1m── react-render-board withRenderBoard end-to-end (webpack) ──\x1b[0m');
  if (!existsSync(path.join(scaffold, 'node_modules', 'webpack'))) {
    console.log('\x1b[33m! webpack 스파이크 node_modules 없음 — 건너뜁니다.\x1b[0m'); return;
  }

  try {
    // RRB_SKIP_BUILD=1: 이미 빌드된 dist-lib을 재사용(동시 세션이 src/visualization을 편집 중이라
    // build:lib가 일시적으로 red일 때, 런타임(src/inject.tsx)이 안 바뀌었으면 재빌드가 불필요).
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

    // 깨끗한 config로 초기화한 뒤, 실제 `react-render-board init`으로 자동 패치(원커맨드).
    writeFileSync(configPath, CLEAN_CONFIG);
    const initOut = await sh('node', [cliBin, 'init'], scaffold);
    if (/wrapped-cjs/.test(initOut) && /withRenderBoard/.test(readFileSync(configPath, 'utf8'))) {
      pass('`init`이 webpack.config를 자동 패치(withRenderBoard 래핑).');
    } else { fail('init이 webpack.config를 자동 패치 못 함.'); console.log(initOut); }

    console.log(`[e2e] webpack serve (port ${PORT}) …`);
    dev = spawn('npm', ['run', 'dev'], { cwd: scaffold, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    await waitReady(dev);
    await new Promise((r) => setTimeout(r, 1500));

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    const allLogs = [];
    page.on('console', (m) => { allLogs.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => { errors.push(String(e)); allLogs.push(`[pageerror] ${String(e)}`); });
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const diag = await page.evaluate(() => ({
      injected: window.__RRB_INJECTED__ === true, booted: window.__RRB_BOOTED__ === true,
      dev: window.__RRB_DEV__ === true, commits: window.__RRB_COMMITS__ || 0,
      roots: window.__RRB_ROOTS__ ? window.__RRB_ROOTS__.size : 'none',
      stubBtn: !!document.getElementById('rrb-floating-button'),
      toggleGroup: !!document.querySelector('.board-toggle-group'), overlay: !!document.getElementById('rrb-overlay-root'),
      bodyLen: document.body ? document.body.innerHTML.length : 0,
    }));
    console.log('[e2e] 진단:', JSON.stringify(diag));
    allLogs.slice(-12).forEach((l) => console.log('   log:', l.slice(0, 200)));

    // 실제 BoardOverlay 토글은 .board-toggle-group 안에 있다(스텁 #rrb-floating-button과 구분).
    const toggle = page.locator('.board-toggle-group').getByRole('button', { name: 'render-board 열기' });
    await toggle.waitFor({ state: 'visible', timeout: 15000 });
    const booted = await page.evaluate(() => window.__RRB_BOOTED__ === true);
    const commits = await page.evaluate(() => window.__RRB_COMMITS__ || 0);
    if (booted) pass('실제 보드 런타임 부팅됨(__RRB_BOOTED__).');
    else fail('런타임 부팅 안 됨(스텁 버튼만).');
    if (commits > 0) pass(`조기 훅이 초기 커밋 관찰(onCommitFiberRoot ${commits}회).`);
    else fail('onCommitFiberRoot 0.');

    // CSS 자기주입 검증(ADR-0069): 이 스파이크엔 css-loader가 없다 — 그런데도 스타일이 적용돼야
    // 한다(런타임이 CSS를 <style>로 직접 주입). 예전엔 "스타일 없이 기능만 정상"이 기대값이었다.
    const fabRadius = await page.evaluate(() => {
      const el = document.querySelector('.board-fab');
      return el ? getComputedStyle(el).borderRadius : null;
    });
    if (fabRadius === '50%') pass('CSS 자기주입 동작(css-loader 없는 소비자에서 .board-fab 스타일 적용).');
    else fail(`CSS 자기주입 실패(.board-fab border-radius=${fabRadius}).`);

    await toggle.click();
    await page.waitForSelector('.react-flow__node', { timeout: 12000 });
    const nodes = await page.locator('.react-flow__node').count();
    if (nodes > 0) pass(`실제 React Flow 캔버스 — 앱 트리 노드 ${nodes}개(webpack에서 보드 동작!).`);
    else fail('캔버스 노드 0.');

    if (readFileSync(indexPath, 'utf8') === indexBefore) pass('app 소스(src/index.tsx) 무수정.');
    else fail('src/index.tsx 변경됨.');

    const realErrors = errors.filter((e) => !/Download the React DevTools|Warning:|favicon/.test(e));
    if (realErrors.length === 0) pass('치명적 콘솔 에러 0.');
    else { realErrors.slice(0, 5).forEach((e) => console.log('   ', e.slice(0, 200))); fail(`콘솔 에러 ${realErrors.length}건.`); }
  } catch (e) {
    fail(String(e && e.message ? e.message : e));
  } finally {
    if (browser) await browser.close();
    if (dev) { try { process.kill(-dev.pid, 'SIGTERM'); } catch { try { dev.kill('SIGTERM'); } catch {} } await new Promise((r) => setTimeout(r, 500)); }
    writeFileSync(configPath, originalConfig);
    writeFileSync(pkgPath, originalPkg);
    if (originalLock !== null) writeFileSync(lockPath, originalLock);
    for (const f of readdirSync(repoRoot)) if (/^react-render-board-.*\.tgz$/.test(f)) try { rmSync(path.join(repoRoot, f), { force: true }); } catch {}
    console.log('[e2e] 스파이크 원상복구 완료.');
  }
  if (failed) { console.error('\x1b[31m검증 실패.\x1b[0m'); process.exitCode = 1; }
  else console.log('\x1b[32m모든 검증 통과.\x1b[0m');
}

main().catch((e) => { console.error(e); process.exit(1); });
