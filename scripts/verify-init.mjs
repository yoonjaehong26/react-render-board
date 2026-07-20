// 배포/설치 "연결 방식"(CLI init + 번들러 주입, ADR-0020/0021/0036) 회귀 검증.
//
// experiments/bundler-injection-spike/vite가 자체 완결형 스텁 스크립트로 검증했던 것을,
// 정식 플러그인(cli/vite.mjs)이 정식 런타임(src/inject.tsx)을 주입하는 형태로 재현한다.
// 대상 스캐폴드(scripts/init-fixture/)의 앱 소스(index.html, app.tsx)는 보드를 전혀
// 참조하지 않는다 — 보드가 뜨면 그건 오직 플러그인 주입 덕분이다.
//
// 확인:
//  1. [dev] 앱 소스 무수정인데도 플로팅 버튼("render-board 열기")이 뜬다.
//  2. [dev] 주입된 런타임이 실제 Fiber 커밋을 관찰한다(보드를 열면 대상 앱 노드가 그려짐).
//  3. [dev] 콘솔 에러 0.
//  4. [prod] `vite build` 산출 HTML에는 주입 스크립트가 없다(apply:'serve' — dev 전용 가드, 요구사항 3).
//
// 실행: node scripts/verify-init.mjs   (npm run verify:init)
import { chromium } from 'playwright';
import { createServer, build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { rrbInjectPlugin } from '../cli/vite.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const fixtureRoot = path.join(repoRoot, 'scripts/init-fixture');

// 검증 전용 entry: 배포 시 'react-render-board/inject'가 될 자리를 로컬 소스로 연결한 파일.
// 루트-상대 경로라, 플러그인이 만드는 인라인 module `import '/board-entry.ts'`를 Vite가
// fixtureRoot 기준으로 해석한다.
const INJECT_ENTRY = '/board-entry.ts';

function fail(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exitCode = 1;
}
function pass(msg) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}

async function verifyDev() {
  const server = await createServer({
    configFile: false,
    root: fixtureRoot,
    // inject.tsx가 repo의 src/·node_modules를 import 하므로 fixtureRoot 밖 접근을 허용한다.
    server: { fs: { allow: [repoRoot] }, port: 5199 },
    plugins: [react(), rrbInjectPlugin({ entry: INJECT_ENTRY })],
    logLevel: 'warn',
  });
  await server.listen();
  const url = `http://localhost:${server.config.server.port}`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  try {
    await page.goto(url, { waitUntil: 'networkidle' });

    // 대상 앱이 실제로 떴는지(주입이 앱을 안 깨뜨렸는지) 먼저 확인.
    await page.waitForSelector('#app-counter', { timeout: 5000 });
    pass('대상 앱이 정상 마운트됨(#app-counter).');

    // 1. 플로팅 버튼 — 앱 소스는 보드를 모르는데도 떠야 한다.
    const toggle = page.getByRole('button', { name: 'render-board 열기' });
    await toggle.waitFor({ state: 'visible', timeout: 5000 });
    pass('플로팅 버튼이 주입만으로 렌더됨("render-board 열기").');

    // CSS 회귀 가드(실사용 결함, ADR-0069): 플러그인이 JS만 주입하고 style.css를 안 실어 보드가
    // 스타일 없이 깨져 보이던 버그 — "캔버스 노드 수"만 보던 기존 검증을 그대로 통과해버렸다.
    // 스타일시트가 실제 적용됐는지 computed style로 확인한다(.board-fab { border-radius: 50% }).
    const fabRadius = await page.evaluate(() => {
      const el = document.querySelector('.board-fab');
      return el ? getComputedStyle(el).borderRadius : null;
    });
    if (fabRadius === '50%') pass('보드 CSS 로드됨(.board-fab border-radius 50%).');
    else fail(`보드 CSS 미적용(.board-fab border-radius=${fabRadius}) — style.css 주입 결함.`);

    // 앱 소스 무수정 증명: 주석/설명 텍스트를 제거한 뒤, 실제 import 문이 보드를 끌어오지
    // 않는지 확인한다(설명 주석에 "render-board"라는 단어가 있어도 위반이 아니다).
    const stripComments = (s) =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/<!--[\s\S]*?-->/g, '');
    const appCode = stripComments(readFileSync(path.join(fixtureRoot, 'app.tsx'), 'utf8'));
    const htmlCode = stripComments(readFileSync(path.join(fixtureRoot, 'index.html'), 'utf8'));
    if (/react-render-board|board-entry|['"][^'"]*\/inject['"]/i.test(appCode + htmlCode)) {
      fail('스캐폴드 앱 소스가 보드를 참조함(import) — "무수정" 전제 위반.');
    } else {
      pass('스캐폴드 앱 소스(app.tsx/index.html) 코드에 보드 import 0 — 앱 무수정 확인.');
    }

    // 2. 주입된 런타임이 실제 커밋을 관찰하는가 — 보드를 열어 대상 앱 노드가 그려지는지 확인.
    await toggle.click();
    await page.waitForSelector('.react-flow__node', { timeout: 5000 });
    const nodeCount = await page.locator('.react-flow__node').count();
    if (nodeCount > 0) pass(`보드가 대상 앱 Fiber 커밋을 관찰함(React Flow 노드 ${nodeCount}개).`);
    else fail('보드는 열렸으나 노드가 0 — Fiber 훅이 커밋을 못 받음.');

    mkdirSync(path.join(repoRoot, 'verify-output/matrix'), { recursive: true });
    await page.screenshot({ path: path.join(repoRoot, 'verify-output/matrix/vite.png') }).catch(() => {});

    // 3. 콘솔 에러 0.
    if (consoleErrors.length === 0) pass('콘솔 에러 0.');
    else fail(`콘솔 에러 ${consoleErrors.length}건: ${consoleErrors.slice(0, 3).join(' | ')}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

async function verifyProdGuard() {
  // dev 전용 가드: 프로덕션 빌드에는 주입이 없어야 한다(apply:'serve').
  const outDir = path.join(repoRoot, 'scratch-verify-init-dist');
  await build({
    configFile: false,
    root: fixtureRoot,
    plugins: [react(), rrbInjectPlugin({ entry: INJECT_ENTRY })],
    logLevel: 'error',
    build: { outDir, emptyOutDir: true, rollupOptions: { input: path.join(fixtureRoot, 'index.html') } },
  });
  const outHtml = readFileSync(path.join(outDir, 'index.html'), 'utf8');
  if (outHtml.includes('board-entry') || outHtml.includes('react-render-board/inject')) {
    fail('프로덕션 빌드 HTML에 주입 스크립트가 남음 — dev 전용 가드 실패.');
  } else {
    pass('프로덕션 빌드 HTML에 주입 없음 — dev 전용 가드 확인(apply:\'serve\').');
  }
  rmSync(outDir, { recursive: true, force: true });
}

async function main() {
  console.log('\x1b[1m── react-render-board init/injection 검증 ──\x1b[0m');
  await verifyDev();
  await verifyProdGuard();
  if (process.exitCode) console.error('\x1b[31m검증 실패.\x1b[0m');
  else console.log('\x1b[32m모든 검증 통과.\x1b[0m');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
