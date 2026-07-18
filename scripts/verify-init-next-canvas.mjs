// Turbopack 실제 캔버스 — 원커맨드 `init` 플로우 end-to-end 실측 (ADR-0036).
//
// 실제 소비자 경험을 그대로 재현한다: 라이브러리를 패키징(npm pack)해 스파이크에 설치하고
// (deps인 bippy·@xyflow/react·roughjs가 함께 옴), `react-render-board init`을 돌려 layout을
// 자동 패치 + RenderBoardClient.tsx 생성, 그리고 `next dev`(Turbopack)로 실제 React Flow
// 캔버스가 Next 앱 트리를 그리는지 확인한다. page 소스는 무수정. 끝나면 스파이크를 원상복구.
//
// 실행: node scripts/verify-init-next-canvas.mjs (npm run verify:init-next-canvas)
// — build:lib + npm pack + install + next dev 컴파일로 수 분 걸린다. 기본 게이트엔 안 넣는다.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scaffold = path.join(repoRoot, 'experiments/bundler-injection-spike/turbopack-nextjs');
const appDir = path.join(scaffold, 'src/app');
const layoutPath = path.join(appDir, 'layout.tsx');
const pagePath = path.join(appDir, 'page.tsx');
const clientPath = path.join(appDir, 'RenderBoardClient.tsx');
const pkgPath = path.join(scaffold, 'package.json');
const lockPath = path.join(scaffold, 'package-lock.json');
const cliBin = path.join(repoRoot, 'cli/bin.mjs');
const PORT = 5310;

const CLEAN_LAYOUT = `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
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
    c.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args.join(' ')} exit ${code}\n${out.slice(-600)}`))));
  });
}
function waitReady(child) {
  return new Promise((resolve, reject) => {
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; if (/Ready|localhost:/i.test(buf)) resolve(); });
    child.stderr.on('data', (d) => { buf += d; });
    child.on('exit', (c) => reject(new Error(`dev exited ${c}`)));
    setTimeout(() => reject(new Error('dev 준비 타임아웃(120s)')), 120_000);
  });
}

const originalLayout = readFileSync(layoutPath, 'utf8');
const originalPkg = readFileSync(pkgPath, 'utf8');
const originalLock = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : null;
const pageBefore = readFileSync(pagePath, 'utf8');
let tgz, dev, browser;

async function main() {
  console.log('\x1b[1m── react-render-board init 캔버스 end-to-end (Next/Turbopack) ──\x1b[0m');
  if (!existsSync(path.join(scaffold, 'node_modules', 'next'))) {
    console.log('\x1b[33m! 스파이크 node_modules 없음 — 건너뜁니다.\x1b[0m'); return;
  }

  try {
    // 1. 라이브러리 패키징(dist-lib 최신화 + npm pack).
    console.log('[e2e] build:lib …'); await sh('npm', ['run', 'build:lib'], repoRoot);
    console.log('[e2e] npm pack …');
    const packOut = await sh('npm', ['pack', '--json'], repoRoot);
    const packed = JSON.parse(packOut.slice(packOut.indexOf('[')))[0].filename;
    tgz = path.join(repoRoot, packed);
    pass(`패키징 완료: ${packed}`);

    // 2. 소비자(스파이크)에 설치 — deps(bippy·@xyflow/react·roughjs)가 함께 온다.
    console.log('[e2e] 스파이크에 설치 …');
    writeFileSync(layoutPath, CLEAN_LAYOUT); // init이 패치할 깨끗한 상태
    await sh('npm', ['install', tgz, '--legacy-peer-deps', '--no-audit', '--no-fund'], scaffold);
    pass('react-render-board 설치 완료(+deps).');

    // 3. 실제 CLI로 원커맨드 init. ADR-0062(0.2.0)부터는 2번의 `npm install`이 postinstall로
    // init을 먼저 수행하므로, 여기서는 "이미 설정돼 있음"(멱등 확인)도 정상 경로다.
    const initOut = await sh('node', [cliBin, 'init'], scaffold);
    const alreadyWired = /이미 react-render-board가 설정/.test(initOut);
    if ((/wired-canvas/.test(initOut) || alreadyWired) && existsSync(clientPath)) {
      pass(`\`init\`이 layout 패치 + RenderBoardClient.tsx 생성${alreadyWired ? ' (postinstall 선수행 + 멱등 확인, ADR-0062)' : ''}.`);
    } else { fail('init이 캔버스 배선을 못 함.'); console.log(initOut); }

    // 4. next dev(Turbopack)로 실제 캔버스 확인.
    console.log(`[e2e] next dev (port ${PORT}) …`);
    dev = spawn('npm', ['run', 'dev', '--', '--port', String(PORT)], { cwd: scaffold, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    await waitReady(dev);
    await new Promise((r) => setTimeout(r, 1500));

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const toggle = page.getByRole('button', { name: 'render-board 열기' });
    await toggle.waitFor({ state: 'visible', timeout: 15000 });
    const booted = await page.evaluate(() => window.__RRB_BOOTED__ === true);
    if (booted) pass('실제 보드 런타임 부팅됨(__RRB_BOOTED__).');
    else fail('런타임이 부팅 안 됨(스텁 버튼만).');

    await toggle.click();
    await page.waitForSelector('.react-flow__node', { timeout: 12000 });
    const nodes = await page.locator('.react-flow__node').count();
    if (nodes > 0) pass(`실제 React Flow 캔버스 — Next 앱 트리 노드 ${nodes}개.`);
    else fail('캔버스 노드 0.');
    mkdirSync(path.join(repoRoot, 'verify-output'), { recursive: true });
    await page.screenshot({ path: path.join(repoRoot, 'verify-output', 'next-turbopack-canvas.png') }).catch(() => {});

    if (readFileSync(pagePath, 'utf8') === pageBefore) pass('app/page.tsx 무수정.');
    else fail('page.tsx 변경됨.');

    const realErrors = errors.filter((e) => !/Download the React DevTools|Warning:/.test(e));
    if (realErrors.length === 0) pass('치명적 콘솔 에러 0.');
    else { realErrors.slice(0, 5).forEach((e) => console.log('   ', e.slice(0, 200))); fail(`콘솔 에러 ${realErrors.length}건.`); }
  } catch (e) {
    fail(String(e && e.message ? e.message : e));
  } finally {
    if (browser) await browser.close();
    if (dev) { try { process.kill(-dev.pid, 'SIGTERM'); } catch { try { dev.kill('SIGTERM'); } catch {} } await new Promise((r) => setTimeout(r, 500)); }
    writeFileSync(layoutPath, originalLayout);
    writeFileSync(pkgPath, originalPkg);
    if (originalLock !== null) writeFileSync(lockPath, originalLock);
    try { rmSync(clientPath, { force: true }); } catch {}
    for (const f of readdirSync(repoRoot)) if (/^react-render-board-.*\.tgz$/.test(f)) try { rmSync(path.join(repoRoot, f), { force: true }); } catch {}
    console.log('[e2e] 스파이크 원상복구 완료.');
  }
  if (failed) { console.error('\x1b[31m검증 실패.\x1b[0m'); process.exitCode = 1; }
  else console.log('\x1b[32m모든 검증 통과.\x1b[0m');
}

main().catch((e) => { console.error(e); process.exit(1); });
