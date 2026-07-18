// Turbopack/Next.js "연결 방식" 실측 검증 (ADR-0021/0036).
//
// cli/next.mjs의 patchNextLayout이 실제 Next 16 + Turbopack 스캐폴드
// (experiments/bundler-injection-spike/turbopack-nextjs)에서, 앱 page 소스를 안 건드리고
// 루트 layout <head>에 조기 <script>를 심어 — ① 앱 무수정 ② 초기 커밋부터 훅이 걸림
// (window.__RRB_COMMITS__ > 0) ③ 플로팅 버튼 렌더 ④ dev 전용 가드(process.env.NODE_ENV)
// 를 만족하는지 확인한다.
//
// 검증을 재현 가능하게 하려고, 스파이크의 커밋된 layout.tsx를 그대로 두지 않고 실행 중에만
// "깨끗한 최소 layout"으로 바꿔 패치→검증하고 finally에서 원본을 복원한다(page.tsx 등 앱
// 소스는 절대 안 건드린다).
//
// 실행: node scripts/verify-init-next.mjs   (npm run verify:init-next) — next dev 컴파일이
// 있어 수십 초 걸린다. 기본 test 게이트에는 넣지 않는다.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { patchNextLayout, RRB_NEXT_MARKER } from '../cli/next.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scaffold = path.join(repoRoot, 'experiments/bundler-injection-spike/turbopack-nextjs');
const layoutPath = path.join(scaffold, 'src/app/layout.tsx');
const pagePath = path.join(scaffold, 'src/app/page.tsx');
const PORT = 5307;

// Next 16 App Router 최소 루트 layout(폰트/네트워크 의존 없음). patchNextLayout이 <head>째 삽입.
const CLEAN_LAYOUT = `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;

let failed = false;
const fail = (m) => { console.error(`\x1b[31m✗ ${m}\x1b[0m`); failed = true; };
const pass = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (d) => {
      buf += d.toString();
      if (/Ready in/i.test(buf) || /✓ Ready/.test(buf) || new RegExp(`localhost:${PORT}`).test(buf)) resolve();
    };
    const onExit = (code) => reject(new Error(`dev server exited early (code ${code})`));
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => { buf += d.toString(); });
    child.on('exit', onExit);
    setTimeout(() => reject(new Error('dev 서버 준비 타임아웃(90s)')), 90_000);
  });
}

async function main() {
  console.log('\x1b[1m── react-render-board init/injection 검증 (Next.js/Turbopack) ──\x1b[0m');

  if (!existsSync(path.join(scaffold, 'node_modules', 'next'))) {
    console.log('\x1b[33m! Next 스캐폴드에 node_modules가 없어 건너뜁니다.\x1b[0m');
    console.log(`  준비: (cd ${path.relative(repoRoot, scaffold)} && npm install)`);
    return;
  }

  const originalLayout = readFileSync(layoutPath, 'utf8');
  const pageBefore = readFileSync(pagePath, 'utf8');
  let devServer;
  let browser;

  try {
    // 깨끗한 layout → 패치.
    const { changed, source, reason } = patchNextLayout(CLEAN_LAYOUT);
    if (!changed) throw new Error(`패치 실패: ${reason}`);
    pass(`layout 패치됨(${reason}).`);

    // 구조적 dev 전용 가드 확인(프로덕션엔 정적 치환으로 스크립트가 안 들어감).
    if (source.includes("process.env.NODE_ENV !== 'production'") && source.includes(RRB_NEXT_MARKER)) {
      pass('삽입된 <script>가 process.env.NODE_ENV 가드로 감싸짐 — 프로덕션 정적 제외(dev 전용).');
    } else {
      fail('dev 전용 가드가 삽입 결과에 없음.');
    }
    writeFileSync(layoutPath, source);

    // next dev(Turbopack) 기동.
    console.log(`[verify] next dev 기동 (port ${PORT})…`);
    devServer = spawn('npm', ['run', 'dev', '--', '--port', String(PORT)], {
      cwd: scaffold, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    await waitForReady(devServer);
    await new Promise((r) => setTimeout(r, 1200)); // 첫 컴파일 여유

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const consoleErrors = [];
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    page.on('pageerror', (e) => consoleErrors.push(String(e)));

    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });

    // ① 플로팅 버튼(앱 소스 무수정인데 뜬다).
    await page.waitForSelector('#rrb-floating-button', { state: 'visible', timeout: 8000 });
    pass('플로팅 버튼이 layout 주입만으로 렌더됨(#rrb-floating-button).');

    // ② 조기 훅이 초기 커밋을 관찰(타이밍 승리 — Next Fast-Refresh 선점을 <head> 동기 스크립트가 이김).
    const injected = await page.evaluate(() => window.__RRB_INJECTED__ === true);
    const commits = await page.evaluate(() => window.__RRB_COMMITS__ || 0);
    if (injected) pass('window.__RRB_INJECTED__ === true.');
    else fail('__RRB_INJECTED__가 안 잡힘.');
    if (commits > 0) pass(`조기 훅이 초기 커밋 관찰(onCommitFiberRoot ${commits}회) — Turbopack 타이밍 승리.`);
    else fail('onCommitFiberRoot가 0 — 훅이 너무 늦게 설치됨(Next 선점에 밀림).');

    // ③ 앱 page 소스 무수정.
    const pageAfter = readFileSync(pagePath, 'utf8');
    if (pageAfter === pageBefore) pass('app/page.tsx 무수정 — layout만 건드림.');
    else fail('app/page.tsx가 변경됨.');

    // ④ 콘솔 에러 0.
    if (consoleErrors.length === 0) pass('콘솔 에러 0.');
    else fail(`콘솔 에러 ${consoleErrors.length}건: ${consoleErrors.slice(0, 3).join(' | ')}`);
  } catch (err) {
    fail(String(err && err.message ? err.message : err));
  } finally {
    if (browser) await browser.close();
    if (devServer) {
      try { process.kill(-devServer.pid, 'SIGTERM'); }
      catch { try { devServer.kill('SIGTERM'); } catch { /* ignore */ } }
      await new Promise((r) => setTimeout(r, 500));
    }
    writeFileSync(layoutPath, originalLayout); // 스파이크 원본 복원
    console.log('[verify] 스파이크 layout.tsx 원본 복원 완료.');
  }

  if (failed) { console.error('\x1b[31m검증 실패.\x1b[0m'); process.exitCode = 1; }
  else console.log('\x1b[32m모든 검증 통과.\x1b[0m');
}

main().catch((e) => { console.error(e); process.exit(1); });
