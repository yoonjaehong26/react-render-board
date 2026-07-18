// react-render-board init 핵심 로직 — `cli/bin.mjs`(대화형 CLI)와 `cli/postinstall.mjs`
// (자동 postinstall) 둘 다 이 모듈의 runInit(cwd, opts)를 공유한다.
//
// cwd를 모듈 top-level이 아니라 파라미터로 받는 이유: postinstall 훅에서는 Node 프로세스의
// process.cwd()가 "설치되는 패키지 자신의 위치"(node_modules/react-render-board)로 설정되고,
// 실제 타깃(소비자 프로젝트 루트)은 npm이 별도로 주는 INIT_CWD 환경변수로만 알 수 있다
// (cli/postinstall.mjs 참고). 그래서 이 모듈은 어떤 cwd를 쓸지 호출자가 정하게 한다.
//
// opts.mode: 'interactive'(기본, 대화형 CLI) | 'postinstall'(자동 실행). postinstall 모드에서는
// "번들러를 못 찾음"류의 기대 가능한 실패를 process.exitCode = 1로 표시하지 않는다 — 그게
// `npm install` 자체를 실패로 표시해버리기 때문이다(postinstall.mjs가 이중으로 강제 0 처리도 함).

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { patchNextLayout, wireCanvasIntoLayout, RENDER_BOARD_CLIENT_SOURCE, manualSnippet } from './next.mjs';
import webpackHelper from './webpack.cjs';

const { patchWebpackConfig } = webpackHelper;

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', red: '\x1b[31m',
};
const log = (s = '') => console.log(s);
const ok = (s) => log(`${C.green}✓${C.reset} ${s}`);
const warn = (s) => log(`${C.yellow}!${C.reset} ${s}`);
const step = (s) => log(`${C.cyan}→${C.reset} ${s}`);

function findFile(cwd, names) {
  for (const n of names) {
    const p = join(cwd, n);
    if (existsSync(p)) return p;
  }
  return null;
}

// ── 번들러 감지 ────────────────────────────────────────────────────────────
function detectBundler(cwd) {
  const nextCfg = findFile(cwd, ['next.config.ts', 'next.config.js', 'next.config.mjs']);
  if (nextCfg) return { kind: 'next', config: nextCfg };

  const viteCfg = findFile(cwd, ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']);
  if (viteCfg) return { kind: 'vite', config: viteCfg };

  const rspackCfg = findFile(cwd, ['rspack.config.ts', 'rspack.config.js', 'rspack.config.mjs']);
  if (rspackCfg) return { kind: 'rspack', config: rspackCfg };

  const webpackCfg = findFile(cwd, ['webpack.config.js', 'webpack.config.ts', 'webpack.config.mjs']);
  if (webpackCfg) return { kind: 'webpack', config: webpackCfg };

  return { kind: 'unknown', config: null };
}

// ── Vite 자동 패치(1급 경로) ─────────────────────────────────────────────────
function initVite(cwd, configPath) {
  const src = readFileSync(configPath, 'utf8');

  if (src.includes('react-render-board/vite') || src.includes('rrbInjectPlugin')) {
    ok('vite.config는 이미 react-render-board가 설정돼 있습니다. 변경 없음.');
    return;
  }

  const importLine = `import { rrbInjectPlugin } from 'react-render-board/vite'`;
  let patched = src;

  // 1) import 추가 — 마지막 import 문 뒤에 삽입(없으면 파일 맨 앞).
  const importRe = /^\s*import\s.+?$/gm;
  let lastImportEnd = -1;
  for (const m of src.matchAll(importRe)) lastImportEnd = m.index + m[0].length;
  patched =
    lastImportEnd >= 0
      ? patched.slice(0, lastImportEnd) + `\n${importLine}` + patched.slice(lastImportEnd)
      : `${importLine}\n` + patched;

  // 2) plugins 배열에 rrbInjectPlugin() 추가.
  if (/plugins\s*:\s*\[/.test(patched)) {
    patched = patched.replace(/plugins\s*:\s*\[/, (m) => `${m}rrbInjectPlugin(), `);
  } else {
    // plugins 배열이 없으면 자동 삽입이 위험하므로 수동 안내로 폴백.
    warn('vite.config에서 `plugins: [...]` 배열을 찾지 못해 자동 삽입을 건너뜁니다.');
    printViteManual();
    return;
  }

  writeFileSync(configPath, patched);
  ok(`패치 완료: ${configPath.replace(cwd + '/', '')}`);
  log(`  ${C.dim}+ ${importLine}${C.reset}`);
  log(`  ${C.dim}+ plugins 배열에 rrbInjectPlugin() 추가${C.reset}`);
  log();
  step(`이제 평소처럼 dev 서버를 실행하면 됩니다:  ${C.bold}npm run dev${C.reset}`);
  log(`  ${C.dim}화면 우측 하단에 "render-board 열기" 버튼이 뜹니다(dev 전용).${C.reset}`);
}

function printViteManual() {
  log('수동 설정: vite.config에 아래를 추가하세요.');
  log(`${C.dim}  import { rrbInjectPlugin } from 'react-render-board/vite'${C.reset}`);
  log(`${C.dim}  export default defineConfig({ plugins: [react(), rrbInjectPlugin()] })${C.reset}`);
}

// ── webpack/Rspack — 흔한 CJS 형태는 자동 패치, 아니면 안내 폴백 ──────────────
function initWebpackLike(cwd, kind, configPath) {
  const rel = configPath ? configPath.replace(cwd + '/', '') : `${kind}.config.js`;
  warn(`${kind} 감지.`);
  log();

  if (configPath) {
    const src = readFileSync(configPath, 'utf8');
    const { changed, source, reason } = patchWebpackConfig(src);
    if (!changed && reason === 'already-patched') {
      ok(`${rel}는 이미 react-render-board가 설정돼 있습니다. 변경 없음.`);
      return;
    }
    if (changed) {
      writeFileSync(configPath, source);
      ok(`패치 완료: ${rel} (${reason})`);
      log(`  ${C.dim}+ require('react-render-board/webpack') + module.exports = withRenderBoard(...)${C.reset}`);
      log();
      step(`이제 평소처럼 실행하면 됩니다:  ${C.bold}npm run dev${C.reset}`);
      log(`  ${C.dim}조기 <head> 스크립트 + 런타임 entry로 보드 캔버스가 뜹니다(dev 전용).${C.reset}`);
      log(`  ${C.dim}(react-render-board가 설치돼 있어야 합니다 — deps가 함께 옵니다.)${C.reset}`);
      if (kind === 'rspack') {
        log(`  ${C.dim}Rspack 주의: 조기 <head> 스크립트는 html-webpack-plugin에서만 자동 주입됩니다${C.reset}`);
        log(`  ${C.dim}(내장 HtmlRspackPlugin이면 entry는 얹히나 훅 타이밍은 보장 못 함 — ADR-0021).${C.reset}`);
      }
      return;
    }
    // 자동 패치 불가(함수형/배열/ESM config) → 수동 안내.
    warn(`${rel}가 자동 패치하기 어려운 형태입니다(${reason}). 아래 한 줄을 직접 추가하세요:`);
  } else {
    warn(`${kind} config 파일을 못 찾았습니다. 아래처럼 감싸세요:`);
  }
  log(`${C.dim}  const { withRenderBoard } = require('react-render-board/webpack')${C.reset}`);
  log(`${C.dim}  module.exports = withRenderBoard(/* 기존 config */)${C.reset}`);
  log(`${C.dim}  // ESM이면: import { withRenderBoard } from 'react-render-board/webpack'${C.reset}`);
}

// ── Next.js/Turbopack 자동 패치(조건부) ──────────────────────────────────────
// Turbopack엔 플러그인 API가 없고(ADR-0021), 클라이언트 useEffect import는 Next Fast-Refresh
// 훅 선점에 타이밍이 밀린다 — 검증된 방식은 루트 layout <head>의 동기 <script>다. 그래서
// 여기서는 그 <script>를 layout.tsx에 자동 삽입한다(page/컴포넌트 소스는 무수정).
function initNext(cwd, mode) {
  const layoutPath = findFile(cwd, [
    'app/layout.tsx', 'app/layout.jsx', 'src/app/layout.tsx', 'src/app/layout.jsx',
  ]);
  warn('Next.js/Turbopack 감지 — 루트 layout의 <head>에 조기 실행 <script>를 삽입합니다(ADR-0021 검증 방식).');
  log();

  if (!layoutPath) {
    warn('app/layout.tsx(또는 src/app/layout.tsx)를 찾지 못했습니다(App Router 전용, Pages Router 미지원). 수동 삽입:');
    log(`${C.dim}${manualSnippet()}${C.reset}`);
    if (mode !== 'postinstall') process.exitCode = 1;
    return;
  }

  const src = readFileSync(layoutPath, 'utf8');
  const headResult = patchNextLayout(src);

  if (!headResult.changed && headResult.reason === 'already-patched') {
    ok('layout은 이미 react-render-board가 설정돼 있습니다. 변경 없음.');
    return;
  }
  if (!headResult.changed) {
    warn(`layout에서 <html>/<head>를 찾지 못해(${headResult.reason}) 자동 삽입을 건너뜁니다. 수동 삽입:`);
    log(`${C.dim}${manualSnippet()}${C.reset}`);
    if (mode !== 'postinstall') process.exitCode = 1;
    return;
  }

  // <head> 조기 스크립트에 이어 캔버스 클라이언트 컴포넌트까지 배선한다(둘 다 dev 전용).
  const canvas = wireCanvasIntoLayout(headResult.source);
  writeFileSync(layoutPath, canvas.changed ? canvas.source : headResult.source);

  // RenderBoardClient.tsx 생성(있으면 건드리지 않음).
  const clientPath = join(dirname(layoutPath), 'RenderBoardClient.tsx');
  let wroteClient = false;
  if (!existsSync(clientPath)) {
    writeFileSync(clientPath, RENDER_BOARD_CLIENT_SOURCE);
    wroteClient = true;
  }

  ok(`패치 완료: ${layoutPath.replace(cwd + '/', '')} (${headResult.reason} + ${canvas.reason})`);
  log(`  ${C.dim}+ <head>에 조기 훅/버퍼링 <script> (dev 전용, process.env.NODE_ENV 가드)${C.reset}`);
  if (canvas.changed) log(`  ${C.dim}+ <body>에 <RenderBoardClient/> (dev 전용 렌더)${C.reset}`);
  if (wroteClient) log(`  ${C.dim}+ 생성: ${clientPath.replace(cwd + '/', '')}${C.reset}`);
  log();
  step(`이제 평소처럼 실행하면 됩니다:  ${C.bold}npm run dev${C.reset}`);
  log(`  ${C.dim}Turbopack에서 앱 소스 무수정으로 보드 캔버스가 뜨고, 앱의 실제 컴포넌트 트리가 그려집니다.${C.reset}`);
  log(`  ${C.dim}(react-render-board가 설치돼 있어야 합니다 — deps인 bippy·@xyflow/react·roughjs가 함께 옵니다.)${C.reset}`);
}

/**
 * @param {string} cwd 대상 프로젝트 루트(소비자 프로젝트).
 * @param {{ mode?: 'interactive' | 'postinstall' }} [opts]
 */
export function runInit(cwd, opts = {}) {
  const mode = opts.mode ?? 'interactive';

  log(`${C.bold}react-render-board init${C.reset}`);
  log(`${C.dim}${cwd}${C.reset}`);
  log();

  const { kind, config } = detectBundler(cwd);
  switch (kind) {
    case 'vite': initVite(cwd, config); break;
    case 'webpack':
    case 'rspack': initWebpackLike(cwd, kind, config); break;
    case 'next': initNext(cwd, mode); break;
    default:
      warn('지원하는 번들러 설정(vite/webpack/rspack/next)을 찾지 못했습니다.');
      log('지원: Vite(자동), webpack·Rspack(config 헬퍼), Next.js/Turbopack(layout 자동).');
      log(`현재 디렉터리 파일: ${C.dim}${readdirSync(cwd).filter((f) => f.includes('config')).join(', ') || '(config 파일 없음)'}${C.reset}`);
      if (mode !== 'postinstall') process.exitCode = 1;
  }
}
