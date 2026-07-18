# ADR-0062: `npm install` 원커맨드 자동화 — postinstall 훅 + pnpm 대응

- 상태: 채택됨(구현, 실측 검증 완료)
- 날짜: 2026-07-18

## 맥락 (Context)

[ADR-0036](0036-distribution-connection-implementation.md)이 Vite·Turbopack·webpack 세 경로 모두 `npm install` → `npx react-render-board init` → `npm run dev`를 원커맨드 수준으로 만들었지만, 여전히 **`install`과 `init` 두 명령**이 필요했다. 사용자가 "개발자가 최대한 진입장벽 없이 명령어 한 줄로 사용까지 했으면 좋겠다"고 명시적으로 요청해, `install` 한 줄만으로 끝나는지(적어도 npm/yarn에서) 검증하고 구현했다.

## 결정 (Decision)

**`package.json`에 `postinstall` 스크립트를 추가해, `npm install` 직후 `init` 로직이 자동 실행되게 한다.**

### 구조 리팩터링

기존 `cli/bin.mjs`가 모듈 top-level `const cwd = process.cwd()`를 여러 함수가 공유하는 구조였는데, postinstall 훅은 **cwd가 다르게 주어진다**(아래 참고) — 그래서 감지/패치 로직을 `cli/init-core.mjs`의 `runInit(cwd, opts)`로 뽑아, `cli/bin.mjs`(대화형)와 `cli/postinstall.mjs`(자동)가 함께 쓴다.

### 안전장치 3중

1. **타깃 디렉터리 = `INIT_CWD`.** npm이 postinstall 스크립트를 돌릴 때 `process.cwd()`는 "설치되는 패키지 자신의 위치"(`<소비자>/node_modules/react-render-board`)로 바뀐다. 실제 타깃(소비자 프로젝트 루트)은 npm이 주는 `INIT_CWD` 환경변수로만 알 수 있다. 없으면 관여하지 않는다.
2. **자기설치 가드.** `INIT_CWD`가 이 패키지 자신의 루트(`import.meta.url` 기준 계산)와 같으면 스킵 — 이 저장소를 개발하며 `npm install`할 때 자기 자신의 데모 `vite.config.ts`를 오염시키는 걸 막는다. (실측 중 이 가드 없이 대화형 CLI를 저장소 루트에서 직접 실행해 실제로 `vite.config.ts`가 오염된 사고가 있었고, `git checkout`으로 복구 후 가드를 검증했다 — 대화형 CLI 자체엔 이 가드가 없다는 걸 재확인시켜준 사고였다.)
3. **`npm install`을 절대 실패시키지 않음.** 어떤 실패 경로든(번들러 못 찾음, layout 없음, 예외) `postinstall.mjs`는 항상 `exitCode 0`으로 끝난다 — postinstall이 비정상 종료하면 npm이 전체 install을 실패로 표시하는데, 번들러 자동 설정은 편의 기능이지 설치 필수 조건이 아니다.

CI 환경(`process.env.CI`)에서도 스킵한다 — dev-only 도구라 CI 설치에 남길 이유가 없다.

## 실측 검증

패키징 순서를 바꿔 새 버전(`0.2.0`)을 실제 npm에 배포하고, **`init`을 단 한 번도 명시적으로 호출하지 않고** 처음부터 검증했다:

- **Vite**: 새 `npm create vite` 스캐폴드 + `npm install --save-dev react-render-board` 한 줄만으로 `vite.config.ts`에 `rrbInjectPlugin()` 자동 삽입 확인.
- **Next.js/Turbopack**: 새 `create-next-app` 스캐폴드 + `npm install` 한 줄만으로 `layout.tsx` + `RenderBoardClient.tsx` 자동 생성, `next dev`(Turbopack) 부팅 후 Playwright로 `window.__RRB_BOOTED__ === true` + 실제 React Flow 캔버스 노드 렌더 + 콘솔 에러 0 확인.

## pnpm은 다르다 — 그리고 이건 pnpm의 표준 정책이지 이 패키지의 결함이 아니다

pnpm 7+는 처음 보는 의존성의 lifecycle 스크립트(postinstall 포함)를 **기본적으로 실행하지 않는다**(공급망 공격 대응 보안 정책). 실측:

```
pnpm install --save-dev react-render-board
...
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: react-render-board@0.2.0
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

**패키지 쪽에서 이 차단을 우회할 방법은 없다(의도적 설계) — `pnpm-workspace.yaml`의 `onlyBuiltDependencies`를 소비자가 미리 선언해도 여전히 차단됨을 실측으로 확인했다.** 스크립트 자체가 실행되지 않으므로, 패키지 코드가 어떤 안내 메시지나 프롬프트를 띄우는 것 자체가 기술적으로 불가능하다 — 이건 버그가 아니라 pnpm이 "패키지가 스스로 이 게이트를 승인할 수 없게" 만든 보안 모델의 핵심이다(그렇지 않으면 악성 패키지가 자기 자신을 그냥 허용 처리하면 되므로 보안 기능 자체가 무의미해진다).

**이게 이 패키지만의 특이사항이 아님을 실측으로 확인**: 같은 pnpm 프로젝트에서 `esbuild`, `sharp`(둘 다 매우 널리 쓰이는 패키지) 설치도 동일한 포맷의 `[ERR_PNPM_IGNORED_BUILDS]` 메시지로 차단된다 — pnpm 생태계의 표준 온보딩 절차다.

**해결(사용자 쪽 한 번의 승인)**: `pnpm approve-builds --all`(비대화형 일괄 승인) 또는 `pnpm approve-builds`(대화형 선택). 승인 후 재실행하면 우리 `postinstall.mjs`가 실제로 돌아 config를 패치하고, 그 출력(`✓ 패치 완료: vite.config.ts` 등)이 `pnpm approve-builds`의 로그에 그대로 뜬다 — 실측으로 확인.

## 근거 (Rationale)

- **npm/yarn에서 "설치=사용 가능"을 실제로 달성했다.** 사용자의 명시적 요청("최대한 진입장벽 없이 한 줄로")에 부합.
- **postinstall의 알려진 위험을 전부 가드로 상쇄했다**: 무한 재귀/자기오염(자기설치 가드), CI 노이즈(CI 스킵), install 실패 전파(강제 exitCode 0). "설정 파일을 동의 없이 자동으로 고친다"는 postinstall 특유의 우려는, `init`이 애초에 "앱 소스는 무수정, config만 가산적으로 패치, 항상 멱등"하게 설계돼 있어(ADR-0020/0036) 실질적 위험이 낮다고 판단했다.
- **pnpm 케이스는 패키지가 아니라 문서로 해결하는 게 맞다.** 기술적으로 우회 불가능하고, 우회 시도 자체가 pnpm의 보안 모델을 해치는 행위이므로 시도하지 않았다. 대신 README에 pnpm 전용 절차를 명시했다.

## 결과 (Consequences)

- **패키지 매니저별 최종 UX**:
  | | 명령 |
  |---|---|
  | npm / yarn | `npm install --save-dev react-render-board` (한 줄) |
  | pnpm | `pnpm install --save-dev react-render-board && pnpm approve-builds --all` (두 단계, pnpm 표준 절차) |
- **버전**: `0.1.1`(peerDependencies 완화, 아래 별도 기록) → **`0.2.0`**(postinstall 자동화, 기능 추가라 minor).
- **한계**: pnpm은 여전히 한 단계 더 필요하다(패키지 쪽에서 해소 불가). `npx react-render-board init`은 모든 패키지 매니저에서 동일하게 동작하는 수동 폴백으로 남겨둔다(재확인·postinstall 스킵 시 트리거용).
- **되돌리기 쉬움**: `postinstall` 스크립트 한 줄 + 신규 파일(`init-core.mjs`, `postinstall.mjs`) 추가일 뿐, `bin.mjs`의 대화형 동작은 리팩터링 전후 동일하게 회귀 검증했다.

## 부록: `0.1.1` — peerDependencies 실전 버그 수정

배포 직후 실측(새 `create-next-app` 스캐폴드)에서 `peerDependencies: { react: "^19.2.7" }`가 실제 최신 Next 스캐폴드가 설치하는 `react@19.2.4`보다 좁아 **`npm install` 자체가 ERESOLVE로 실패**하는 걸 발견했다. `19.2.7`은 개발 환경에 우연히 깔려있던 버전을 그대로 박은 실수였다. bippy(`>=17`)·`@xyflow/react`(`>=17`)의 실제 peer 요구사항과 자체 코드의 최소 요구사항(`createRoot`/`useSyncExternalStore` → React 18+, React 19 전용 API 미사용 확인)을 근거로 `"^18.0.0 || ^19.0.0"`으로 완화해 `0.1.1`로 재배포했다. 재배포 후 동일 스캐폴드로 재실측해 설치 성공을 확인했다.

## 관련
- [ADR-0020](0020-distribution-entry-ux-direction.md) · [ADR-0036](0036-distribution-connection-implementation.md) · [ADR-0042](0042-npm-publish-prep-and-mit.md)
