#!/usr/bin/env node
// react-render-board postinstall 훅 — `npm install`만으로 원커맨드 자동 설정 (ADR-0062).
//
// package.json의 "postinstall" 스크립트가 이 파일을 실행한다. cli/init-core.mjs의 runInit()을
// 그대로 재사용하되, 대화형 CLI(`npx react-render-board init`, cli/bin.mjs)와 달리 사람이 실행을
// 요청한 게 아니라 npm 라이프사이클이 자동으로 부르는 것이므로 안전장치를 세 겹으로 둔다:
//
// 1. **타깃 디렉터리 = INIT_CWD**(process.cwd()가 아니다). npm은 postinstall 스크립트를 실행할
//    때 프로세스 cwd를 "설치되는 패키지 자신의 위치"(<소비자>/node_modules/react-render-board)로
//    바꿔버린다. 실제 타깃(소비자 프로젝트 루트)은 npm이 별도로 주는 INIT_CWD 환경변수로만 알
//    수 있다. INIT_CWD가 없으면(비-npm 환경, 예상 밖 실행) 아무것도 하지 않고 조용히 종료한다.
//
// 2. **자기설치 가드.** 이 저장소 자신을 개발하며 `npm install`을 돌릴 때도 이 postinstall이
//    똑같이 실행된다 — 그때 INIT_CWD는 이 패키지 자신의 루트와 같다. 그 경우 "자기 자신의
//    데모 vite.config.ts를 자동 패치"해버리는 걸 막기 위해, INIT_CWD가 이 스크립트가 속한
//    패키지 루트와 같으면 스킵한다.
//
// 3. **CI에서는 스킵.** dev-only 도구라 CI 파이프라인에 자동 설정을 남길 이유가 없고,
//    `process.env.CI`가 서 있으면 조용히 넘어간다(다른 devDependency들의 관례와 동일).
//
// 4. **`npm install` 자체를 절대 실패시키지 않는다.** runInit()이 예상 밖으로 던지더라도
//    catch해서 안내만 하고, 이 스크립트는 항상 exitCode 0으로 끝난다 — postinstall이 실패로
//    끝나면 npm이 전체 install을 실패로 표시하는데, "번들러 자동 설정"은 편의 기능이지 설치의
//    필수 조건이 아니다. 실패/스킵 시엔 수동 `npx react-render-board init`을 안내한다.
//
// pnpm 사용자 참고: pnpm 7+는 기본적으로 의존성의 lifecycle 스크립트(postinstall 포함)를
// 실행하지 않는다(보안 정책, `pnpm approve-builds`로 승인해야 동작). 그 경우 이 자동화가
// 조용히 스킵되므로 `npx react-render-board init`을 한 번 수동 실행하면 된다 — 대화형 CLI는
// 항상 동일하게 동작한다.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// INIT_CWD의 package.json이 react-render-board를 **직접** 의존성으로 갖는지 확인한다(ADR-0075
// 후속). 없으면 우리가 다른 패키지의 전이 의존성으로 딸려 온 것이고, 그 프로젝트의 소유자는 이
// 도구를 선택한 적이 없다 — 그런 프로젝트의 config를 자동 수정하면 안 된다. 판정 불가(파일 없음
// /파싱 실패)면 보수적으로 "직접 의존 아님"으로 보고 건드리지 않는다.
function isDirectDependency(initCwd) {
  try {
    const pkgPath = path.join(initCwd, 'package.json');
    if (!existsSync(pkgPath)) return false;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const fields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
    return fields.some((f) => pkg[f] && Object.prototype.hasOwnProperty.call(pkg[f], 'react-render-board'));
  } catch {
    return false;
  }
}

async function main() {
  // 명시적 옵트아웃 — 자동 설정을 원치 않는 사용자를 위한 escape hatch.
  if (process.env.RRB_SKIP_POSTINSTALL) return;
  if (process.env.CI) return; // CI 파이프라인에는 자동 설정을 안 남긴다.

  const initCwd = process.env.INIT_CWD;
  if (!initCwd) return; // npm 라이프사이클 밖에서 실행된 것으로 보임 — 관여하지 않는다.

  // cli/postinstall.mjs -> cli/ -> 패키지 루트.
  const pkgRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
  if (path.resolve(initCwd) === pkgRoot) return; // 이 패키지 자신의 저장소 install — 스킵.

  // 전이 의존성으로 딸려온 경우 스킵 — 이 도구를 직접 고른 프로젝트만 자동 설정한다.
  if (!isDirectDependency(initCwd)) return;

  // 소비자 프로젝트에 아직 node_modules가 없을 만큼 이른 시점(모노레포 워크스페이스 설치 순서
  // 등)이면 config 파일도 아직 없을 수 있다 — 그 경우 detectBundler가 자연히 'unknown'을
  // 돌려주고 안내만 출력한다(에러 아님).
  console.log('\x1b[2m[react-render-board] 번들러 자동 감지 중… (postinstall, ADR-0062)\x1b[0m');
  try {
    // 정적 import가 아니라 동적 import — init-core.mjs(또는 그것이 부르는 어댑터)가 어떤 이유로든
    // 로드 단계에서 던지더라도 이 try/catch가 삼켜 `npm install` 자체는 절대 실패하지 않는다(ADR-0075).
    const { runInit } = await import('./init-core.mjs');
    runInit(initCwd, { mode: 'postinstall' });
  } catch (err) {
    console.error('\x1b[33m![react-render-board]\x1b[0m 자동 설정 중 예외 발생(설치는 정상 완료됩니다):');
    console.error(err);
    console.error('  수동으로 실행하세요: \x1b[1mnpx react-render-board init\x1b[0m');
  }
}

main();

// postinstall은 npm install 자체의 성패와 분리한다 — 위 로직이 어떤 경로를 타든(내부에서
// process.exitCode가 바뀌었더라도) 이 스크립트는 항상 성공으로 끝난다.
process.exitCode = 0;
