#!/usr/bin/env node
// react-render-board CLI — `npx react-render-board init` (ADR-0020/0021/0036/0043).
//
// 목표(ADR-0020): 개발자가 앱 소스에 손대지 않고 한 번만 실행하면 dev 서버에 보드가
// 자동으로 뜨게 한다. react-scan(같은 bippy 저자)이 검증한 "zero-code-change CLI init"
// 패턴을 따른다.
//
// 이 파일은 대화형 진입점일 뿐이다 — 실제 감지/패치 로직은 cli/init-core.mjs의 runInit()에
// 있고, cli/postinstall.mjs(ADR-0062, `npm install` 직후 자동 실행)도 그 함수를 공유한다.
//
// 스코프(ADR-0021 + "MVP는 Vite 경로만 탄탄하면 충분"):
// - Vite  → config를 자동 패치(1급 경로, 완전 자동).
// - Next.js/Turbopack → 루트 layout에 조기 <head> 스크립트 + 클라이언트 컴포넌트 자동 배선.
// - webpack/Rspack → 흔한 CJS config는 자동 래핑, 그 외(함수형/배열/ESM)는 안내.
//
// dev 전용(요구사항 3): 어떤 경로든 dev 서버/개발 빌드에만 주입되도록 설계한다 — Vite
// 플러그인은 apply:'serve', webpack 헬퍼는 mode!=='production'일 때만, Next는
// process.env.NODE_ENV 정적 가드, 런타임 진입점은 __RRB_DEV__/import.meta.env.DEV 가드.

import { runInit } from './init-core.mjs';

const cmd = process.argv[2];

function printHelp() {
  console.log(`\x1b[1mreact-render-board\x1b[0m — React 렌더 트리 라이브 보드 (dev 전용)`);
  console.log();
  console.log('명령:');
  console.log(`  \x1b[36minit\x1b[0m    현재 프로젝트의 번들러를 감지해 보드 자동 주입을 설정`);
  console.log(`         (참고: npm install 직후 postinstall이 이미 자동으로 시도합니다 — ADR-0062.`);
  console.log(`          이 명령은 재실행/재확인/postinstall이 스킵된 경우의 수동 트리거용입니다.)`);
  console.log();
  console.log('예:');
  console.log(`  \x1b[2mnpx react-render-board init\x1b[0m`);
}

if (cmd === 'init') runInit(process.cwd());
else if (cmd === '-h' || cmd === '--help' || cmd === 'help' || !cmd) printHelp();
else {
  console.log(`\x1b[33m!\x1b[0m 알 수 없는 명령: ${cmd}`);
  printHelp();
  process.exitCode = 1;
}
