# ADR-0023: 정식 재구현 1라운드 — 테스트 커버리지 + 배포 준비

- 상태: 채택됨 (아래 §2·§4·§5의 시점 스냅샷은 후속 ADR이 앞질러 감 — 하단 "후속 갱신" 참고)
- 날짜: 2026-07-17

> **후속 갱신(2026-07-20, ADR 정합성 검증 라운드)**: 이 ADR은 2026-07-17 시점의 기록이라 아래 세 항목이 현행 코드와 어긋난다(당시 사실로서는 정확 — 후속 ADR이 앞질러 구현/변경한 결과):
> - **§5 배포 상태**: 본문은 "`private: true` 유지, `license` 미추가"로 못박았으나, 현 `package.json`은 `private` 필드 제거 + `"license": "MIT"` + `"version": "0.2.4"` + `prepublishOnly` 스크립트를 갖는다(ADR-0036 CLI init 배포 흐름 구현 + ADR-0072 publish 게이트가 뒤집음). "미배포/비공개"로 오독하지 말 것.
> - **§2 유닛 테스트 수**: 본문 표(12파일 91개, `sourceHints.test.ts` 4개)는 현재 크게 늘었다(예: `sourceHints.test.ts` 9개). 현 수치는 `npm run test`로 확인.
> - **§4 공개 API**: 본문의 5개 export에서 이후 `domInteraction`/`interactionStore`/`BoardOverlay`/`afterglowStore`/`propsFlow` 등으로 확장됐다(ADR-0026·0032 등). 현행 표면은 `src/index.ts` 참고.

## 맥락 (Context)

[`project-status.md`](../project-status.md) 7-3(b)는 "검증된 3-레이어 구조를 정식 재구현"을 다음 단계로 지목했다. 다만 아키텍처·데이터 스키마는 이미 검증 완료 상태이므로(4절), 이 라운드가 실제로 다룬 "정식 재구현"의 의미는 **구조를 다시 짜는 것이 아니라, 검증된 코드에 자동 테스트를 붙이고 라이브러리로 배포할 준비를 갖추는 것**이었다. 구체적으로 사용자가 지시한 세 가지: ① ADR-0002의 열린 결정(훅킹 라이브러리) 확정, ② 레이어별 유닛/통합 테스트, ③ 패키지 배포 준비(공개 API 정리, peerDependencies, 라이브러리 빌드). ①은 [ADR-0022](0022-hooking-library-confirmed-bippy.md)로 별도 문서화했다 — 이 ADR은 ②·③을 다룬다.

`docs/decisions/0016-max-depth-sibling-counting-fix.md`부터 `0019`까지 반영된 P0~P4 수정, `docs/architecture.md`의 3-레이어 경계, ADR-0007의 groupHint "사용 위치" 의미는 전부 그대로 유지했다 — 이번 라운드에서 바뀐 소스 로직은 없다(단 하나의 예외는 아래 "결정 3"의 순수 리팩터).

## 검토한 대안 (Options)

### 테스트 프레임워크
- **vitest** — Vite와 같은 팀이 만들어 이 프로젝트의 기존 빌드 설정을 그대로 재사용할 수 있고(`vite.config.ts`에 `test` 필드만 추가), jsdom 환경에서 React 컴포넌트 테스트도 같은 러너로 처리된다. 채택.
- **jest** — Vite/rolldown 기반 프로젝트에서는 별도의 transform 파이프라인(babel 또는 ts-jest)을 새로 구성해야 해 도구 하나를 더 들이는 셈이다. CLAUDE.md의 "과한 도구 투자를 하지 않는다" 원칙에 비추어 기각.

### 테스트 대상 분배 (유닛 vs 통합)
- **레이어별 순수 로직(데이터/시각화 lib)은 vitest 유닛 테스트, 실제 브라우저·실제 앱 통합은 기존 `scripts/verify*.mjs`(Playwright)가 계속 담당** — 채택. 이미 실제 앱 3개·9,818노드·240Hz까지 검증한 Playwright 스위트를 유닛 테스트로 재구현하는 건 중복 투자다. 두 계층의 역할을 분리했다: vitest = "이 함수가 옳은가"(빠름, 결정론적, CI 친화적), Playwright = "실제 브라우저에서 실제 앱과 맞물려 도는가"(느림, 실측 기반).
- **Canvas.tsx 전체를 jsdom에 마운트하는 통합 테스트** — 기각. React Flow 내부(ResizeObserver 기반 pane 크기 계산 등)가 jsdom에서 온전히 재현되지 않고, 이미 Playwright가 이 경로를 실제 브라우저로 검증하고 있어 얻는 것에 비해 비용이 크다. 대신 Canvas.tsx 안의 순수 기하 계산(뷰포트↔월드 좌표 변환)만 `visualization/lib/geometry.ts`로 분리해 유닛 테스트로 커버했다(아래 결정 3).

### 라이브러리 .d.ts 생성 도구
- **vite-plugin-dts** — 처음 채택했으나, 이 프로젝트가 쓰는 rolldown 기반 Vite 8 환경에서 "성공" 로그를 남기고도 `.d.ts`를 하나도 만들지 않는 현상이 실측으로 확인됐다(`rollupTypes: true`/`false` 둘 다 재현, `rollupTypes: true`는 별도로 `@microsoft/api-extractor` 미설치 문제도 있었다). 기각.
- **`tsc --emitDeclarationOnly`를 별도 tsconfig로 직접 호출** — 채택. 이미 `npm run build`가 `tsc -b`를 타입체크 게이트로 쓰고 있어 새 도구를 들이지 않고 검증된 경로를 재사용한다.

## 결정 (Decision)

### 1. vitest 테스트 인프라 (`vite.config.ts`, `src/test/setup.ts`)

`vite.config.ts`에 `test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.{test,spec}.{ts,tsx}'] }`를 추가했다. `include`를 `src/`로 좁힌 이유: `experiments/`에는 검증용으로 clone한 제3자 앱(shadcn-admin 등)이 자기 자신의 테스트 스위트를 통째로 갖고 있어, 기본 include 패턴이 그것까지 실행하려 하면(125개 무관한 실패) 이 프로젝트의 테스트 신호가 묻힌다. `setup.ts`는 `@testing-library/jest-dom` 매처와 매 테스트 후 `cleanup()`을 등록한다. `globals: true`는 켜지 않았다 — 각 테스트 파일이 `vitest`에서 명시적으로 import하는 쪽이 tsconfig의 `types` 배열을 건드리지 않는 최소 변경이었다.

`package.json`에 `test`(`vitest run`, CI/1회성)과 `test:watch`(`vitest`, 로컬 반복) 스크립트를 추가했다.

### 2. 레이어별 유닛 테스트 — 12개 파일, 91개 테스트

| 레이어 | 파일 | 테스트 수 | 핵심 검증 대상 |
|---|---|---|---|
| 훅킹 | `hooking/fiberInspector.test.ts` | 5 | `instrument()` 호출/containerInfo 필터링/에러 흡수/dev 게이팅 — `bippy`의 `instrument`를 모킹 |
| 데이터 | `data/serialize.test.ts` | 9 | **ADR-0016 P0 회귀 테스트**(depth는 자식 방향에만 소모, 형제 250개는 안 잘림) 포함. `bippy`를 모킹하지 않고 실제 `isHostFiber`/`isCompositeFiber`/`getDisplayName`/`getFiberId`에 가짜 Fiber 객체를 통과시켜 검증 |
| 데이터 | `data/sourceHints.test.ts` | 4 | `getSource` 성공/null/개별 실패 시 나머지 배치 보존 |
| 데이터 | `data/store.test.ts` | 8 | 커밋 동기 반영, notify 디바운스(jsdom엔 `requestIdleCallback`이 없어 `setTimeout` 폴백 경로가 실제로 실행됨을 확인), groupHint 캐시 재사용, dev-only 게이팅 |
| 시각화/lib | `visualization/lib/groups.test.ts` | 15 | `isLibraryInternalHint` 화이트리스트 반전(ADR-0019), `resolveEffectiveGroups`의 조상 체인 흡수·폴백 규칙 |
| 시각화/lib | `visualization/lib/normalize.test.ts` | 6 | host 노드 숨김 시 조상 재연결, `PENDING_GROUP` |
| 시각화/lib | `visualization/lib/layout.test.ts` | 9 | **그룹 순서 안정성 + pruning(ADR-0018) 회귀 테스트**, 그룹 단위 메모이제이션(시그니처 캐시) |
| 시각화/lib | `visualization/lib/toFlow.test.ts` | 8 | **뷰포트 컬링(ADR-0017) 회귀 테스트** — 접힌 그룹은 컴포넌트 노드/엣지를 아예 안 만듦 |
| 시각화/lib | `visualization/lib/geometry.test.ts` | 9 | 뷰포트↔월드 좌표 변환, 사각형 교차 판정(경계 접촉은 false) |
| 시각화/컴포넌트 | `visualization/components/ComponentNode.test.tsx` | 10 | kind/anonymous/crossGroup/pending에 따른 클래스 조합 |
| 시각화/컴포넌트 | `visualization/components/GroupNode.test.tsx` | 6 | **라벨 역-스케일(ADR-0018) 회귀 테스트** — `useStoreApi().setState({transform})`로 줌을 직접 주입해 `1/zoom` 스케일을 실측 |
| 시각화/컴포넌트 | `visualization/components/SemanticZoomController.test.tsx` | 2 | `MAP_MODE_THRESHOLD` 상/하에서 지도/상세 모드 클래스·문구 전환 |

세 개의 병렬 서브에이전트(데이터+훅킹 / 시각화 lib / 시각화 컴포넌트)가 나눠 작성했고, 완료 후 직접 코드 리뷰로 품질을 확인했다 — 실제 `bippy` 태그 분류 로직(`tag` 5/26/27=host, 0/1/11/14/15=composite)을 모킹 없이 재사용한 점, `store.ts`의 디바운스를 `vi.useFakeTimers()`로 정확히 실측한 점, React Flow의 `panZoom`이 jsdom에서 생성되지 않아 `useReactFlow().setViewport()`가 무력하다는 걸 실제 소스(`useViewportHelper`)까지 확인하고 더 낮은 레벨의 `useStoreApi().setState({transform})`로 우회한 점 등, 근거 없이 통과시키기 위한 얕은 테스트가 아니라는 걸 확인했다.

**의도적으로 다루지 않은 것**: `Canvas.tsx`의 상태 저장 오케스트레이션(`useSettledViewport`/`useAutoRefit`/`BoardContent`)은 유닛 테스트 대상에서 제외했다 — 이미 `scripts/verify-routing.mjs`(ADR-0018 P3), `scripts/verify-stress-scale-live.mjs`(ADR-0017 P1) 등이 실제 브라우저·실제 앱으로 이 경로를 검증하고 있다.

### 3. 순수 기하 로직 분리 — `src/visualization/lib/geometry.ts` (신규 파일, 유일한 소스 로직 변경)

`Canvas.tsx`에 있던 `worldRectFromViewport`/`expandRect`/`rectsIntersect`(뷰포트 기반 부분 재계산, ADR-0017의 핵심 판단 로직)를 유닛 테스트로 직접 검증하기 위해 `export`했더니, oxlint의 `react-refresh` 규칙이 "컴포넌트와 비-컴포넌트를 같은 파일에서 export하면 Fast Refresh가 깨진다"고 경고했다. 이 세 함수를 새 파일 `visualization/lib/geometry.ts`로 옮기고 `Canvas.tsx`는 그걸 import하도록 바꿨다 — 동작 변화 없는 순수 이동이며, 기존 `visualization/lib/{groups,normalize,layout,toFlow}.ts`가 이미 확립한 "Canvas.tsx는 오케스트레이션만, 순수 로직은 lib/"라는 층위 구분을 넓힌 것뿐이다.

### 4. 공개 API — `src/index.ts` (신규 파일)

```ts
export { createRenderStore } from './data/store';
export type { RenderStore, SnapshotListener } from './data/store';
export type { RenderNode, RenderSnapshot, FiberKind } from './data/types';
export { startFiberInspector } from './hooking/fiberInspector';
export { Canvas } from './visualization/Canvas';
```

레이어 내부 구현(`data/serialize.ts` 등)은 재수출하지 않는다 — 3-레이어 구조 중 소비자가 실제로 조립에 필요한 진입점만 노출한다(`src/main.tsx`가 이 다섯 개만으로 데모 앱을 조립하는 것과 동일한 최소 표면). CSS(`@xyflow/react/dist/style.css` + `flow.css`)는 `Canvas`가 내부에서 import하지만, 소비자는 배포판의 `./style.css` export를 별도로 import해야 한다 — 컴포넌트 라이브러리의 표준 패턴이다.

### 5. `package.json` 배포 준비

- `react`/`react-dom`을 `dependencies`에서 `peerDependencies`로 옮기고, 로컬 개발/데모 앱 빌드가 계속 되도록 `devDependencies`에도 이중으로 올렸다(컴포넌트 라이브러리 리포가 스스로의 데모 앱도 겸할 때 쓰는 표준 패턴).
- `@xyflow/react`·`bippy`는 `dependencies`로 유지했다 — 소비자 앱이 독립적으로 이미 갖고 있을 가능성이 낮은 이 프로젝트 고유의 구현 의존성이다(react/react-dom과 다른 판단 근거).
- `main`/`module`/`types`/`exports`/`files`/`sideEffects` 필드를 추가해 `dist-lib/`를 패키지 진입점으로 선언했다.
- `private: true`는 유지했다 — 실제 `npm publish`는 이번 스코프 밖이고(ADR-0020/0021이 정한 CLI init 배포 흐름이 아직 미구현), `license` 필드도 README가 이미 "미정(MIT 권장)"이라 명시한 상태를 존중해 추가하지 않았다. 둘 다 이번 라운드가 임의로 결정할 사안이 아니다.

### 6. 라이브러리 빌드 — `vite.lib.config.ts`, `tsconfig.lib.json`, `build:lib` 스크립트

`vite.config.ts`(데모 앱, `src/main.tsx` 엔트리)와 별개로 `vite.lib.config.ts`를 새로 만들었다 — `src/index.ts`를 엔트리로, `react`/`react-dom`/`react/jsx-runtime`을 external로 두고 ESM 하나(`dist-lib/index.js`)와 CSS 하나(`dist-lib/index.css`, `cssCodeSplit: false`)로 번들링한다.

`.d.ts`는 `tsconfig.lib.json`(`tsconfig.app.json`을 extends, `emitDeclarationOnly`+`declaration`+`rootDir: src`+`outDir: dist-lib`, 테스트 파일 제외)을 통해 `tsc`가 직접 생성한다 — 위 "검토한 대안" 절의 이유로 vite-plugin-dts 대신 선택했다. `build:lib` 스크립트는 `tsc -p tsconfig.lib.json && vite build --config vite.lib.config.ts` 순서로 실행한다. 이 순서가 중요한 이유: vite build의 기본 동작(`emptyOutDir: true`)이 outDir을 비우므로, tsc가 먼저 `.d.ts`를 써넣은 뒤 vite가 그 디렉터리를 지우면 방금 만든 타입 선언이 함께 사라진다 — `vite.lib.config.ts`에 `build.emptyOutDir: false`를 명시해 이 충돌을 막았다.

로컬에서 `pnpm run build:lib` 실행 결과 `dist-lib/`에 `index.js`(260KB, gzip 74KB)·`index.css`(17KB)·레이어별 `.d.ts` 전체가 정상 생성됨을 확인했다.

`dist-lib/`는 `.gitignore`에 `dist`/`dist-ssr`과 나란히 추가했다.

## 근거 (Rationale)

레이어별 유닛 테스트는 이미 검증된 동작(P0~P4 수정 포함)을 코드 변경 없이 "고정"하는 안전망이다 — 다음에 누군가(사람이든 에이전트든) 이 코드를 건드릴 때, 지금까지 실측으로만 확인했던 회귀들(형제-카운팅, 뷰포트 컬링, 그룹 순서 안정성, 화이트리스트 반전, 라벨 역-스케일)을 `npm run test` 몇 초로 다시 확인할 수 있다. 패키지 준비는 지금 당장 배포하려는 게 아니라, ADR-0020/0021이 이미 정한 배포 방향(npm + CLI init)이 실제로 구현될 때 이 저장소가 "그냥 index.ts를 채우기만 하면 되는" 상태이길 바라서다.

## 결과 (Consequences)

- `npm run build`(데모 앱)와 `npm run test`, `npm run lint` 모두 그린 상태로 확인했다(아래 "검증" 절).
- **되돌리기 쉬움**: 이번 라운드가 건드린 소스 로직은 `Canvas.tsx`→`visualization/lib/geometry.ts`로의 순수 이동 하나뿐이다. 나머지는 전부 신규 파일(테스트, `index.ts`, 빌드 설정)이라 어떤 것을 되돌리더라도 기존 검증된 동작에 영향이 없다.
- **알려진 한계**: `tsc -p tsconfig.lib.json`은 소스 트리 구조를 그대로 미러링한 `.d.ts` 여러 개를 만든다(단일 번들 `.d.ts`가 아니다) — 소비자 경험에 실질적 차이는 없지만(`types` 필드가 `index.d.ts`를 가리키고 나머지는 그게 상대경로로 참조), 더 깔끔한 단일 파일을 원한다면 향후 `@microsoft/api-extractor`를 직접 추가하는 선택지가 남아 있다(지금은 과한 투자로 판단해 보류).
- **`emptyOutDir: false`의 트레이드오프**: 소스 파일이 삭제/이동되면 `dist-lib/`에 그 파일의 이전 `.d.ts`가 stale하게 남을 수 있다 — 실제 `npm publish`/CI 파이프라인을 구축할 때(이번 스코프 밖) `rm -rf dist-lib`를 빌드 스크립트 맨 앞에 추가하는 것으로 간단히 해소 가능하다.

## 검증 (Verification)

- `npm run test` — 12개 파일, 91개 테스트 전부 통과.
- `npm run lint` — 신규/변경 파일 기준 경고 0건(사전에 있던 `experiments/`·`scripts/verify-routing.mjs` 경고는 이번 스코프 밖, 다른 병행 세션 소관).
- `npm run build`(`tsc -b && vite build`) — 통과.
- `npm run build:lib` — 통과, `dist-lib/`에 JS·CSS·전체 `.d.ts` 트리 생성 확인.
- `scripts/verify.mjs`(자체 fixture, `npm run dev` 대상) — 콘솔 에러 0건, groupHint 해석·semantic zoom·lazy+Suspense 전환 전부 정상.
- `scripts/verify-real-app.mjs`(excalidraw 실제 앱) — `experiments/real-app-validation/excalidraw/excalidraw-app/_react-render-board/`에 갱신된 `src/`를 다시 복사해 재검증(테스트 파일 제외, `mount.tsx`는 그대로 유지). 그룹 67개 전부 클린한 앱 소스 파일명(노이즈 0%, ADR-0019 회귀 없음), 오버레이 열림/닫힘 응답 배율 0.92배(ADR-0017 회귀 없음), 콘솔/페이지 에러 0건.
