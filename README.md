# react-render-board

[![npm version](https://img.shields.io/npm/v/react-render-board.svg)](https://www.npmjs.com/package/react-render-board)
[![license](https://img.shields.io/npm/l/react-render-board.svg)](./LICENSE)
[![React](https://img.shields.io/badge/React-18%20%7C%2019-61dafb.svg)](https://react.dev)

> React 앱의 **실시간 렌더 트리**를 Figma 같은 보드 위에 박스+선 다이어그램으로 시각화하는 **dev 전용** 도구.

React DevTools의 들여쓰기 리스트 뷰가 아니라, 실행 중인 컴포넌트 구조를 **공간적으로 배치된 노드 다이어그램**으로 보여줍니다. 새 코드베이스에 처음 들어온 사람이 전체 구조를 한눈에 파악하는 것을 목표로 합니다.

```bash
npm install --save-dev react-render-board   # postinstall이 번들러를 감지해 자동 설정
npm run dev                                   # 앱 우측 하단에 보드 버튼이 뜬다
```

> **pnpm 사용자는 한 단계 더 필요합니다** — pnpm은 설치 스크립트를 기본 차단해 위 자동 설정이 안 걸립니다. 바로 [pnpm 섹션](#pnpm)을 확인하세요.

---

## 목차

- [무엇이 다른가](#무엇이-다른가)
- [핵심 기능](#핵심-기능)
- [설치](#설치)
  - [npm / yarn](#npm--yarn)
  - [pnpm](#pnpm)
  - [수동 설정](#수동-설정-init)
- [번들러별 설정](#번들러별-설정)
- [동작 원리](#동작-원리)
- [프로그래밍 방식 API](#프로그래밍-방식-api-커스텀-통합)
- [호환성](#호환성)
- [요구사항 · 한계](#요구사항--한계)
- [프로젝트 상태](#프로젝트-상태)
- [문서](#문서)
- [개발](#개발-이-레포에서)
- [라이선스](#라이선스)

---

## 무엇이 다른가

| 도구 | 접근 | 한계 |
|---|---|---|
| **React DevTools** | 실행 중 트리를 텍스트 리스트로 | 강력하지만 "전체 그림"이 직관적으로 안 들어옴 |
| **CodeSee / 정적 분석** | `import` 관계를 그래프로 | 실제 렌더 구조(`children` prop, Context, 포탈 등)와 불일치 |
| **react-render-board** | **실행 중** Fiber 트리를 **공간 다이어그램**으로 | React 전용 · dev 전용 (아래 [한계](#요구사항--한계)) |

"실시간 렌더 트리 + Figma식 캔버스"라는 조합은 여러 팀이 시도했지만(React-Sight, Realize, Reactron 등) 모두 유지보수가 끊겼습니다. 이 조합은 현재 시장에서 비어 있습니다. 배경 조사는 [`docs/research/prior-art.md`](docs/research/prior-art.md) 참고.

**대상 사용자**: 매일 디버깅하는 베테랑이 아니라, **새 코드베이스에 처음 들어온 사람** — 온보딩, 코드 리뷰, 아키텍처 문서화, 신규 입사자 교육을 위한 도구입니다.

<!--
데모 자리표시자 — 스크린샷/GIF를 아래에 넣으세요:
![보드 개요](docs/assets/overview.gif)
-->

---

## 핵심 기능

### 구조 시각화
- **실시간 렌더 트리** — React 커밋마다 Fiber 트리를 읽어 보드에 반영. 앱이 리렌더되면 보드도 따라 갱신됩니다.
- **도메인별 그룹 프레임** — 컴포넌트를 소스 파일 경로 기준으로 묶어 색이 다른 프레임으로 표시. **"폴더로 묶기"** 토글로 파일 그룹을 상위 폴더로 2단 중첩(folder › file › component).
- **Semantic zoom** — 줌아웃하면 지도 모드(도메인 개요), 줌인하면 상세 모드(개별 컴포넌트). "지도에서도 상세" 토글로 줌아웃해도 화면 안 그룹의 내부를 유지.
- **tidy-tree 배치** — 부모를 자식 스팬의 중앙 위에 놓는 대칭 트리 레이아웃. 좌→우가 렌더 순서, 위→아래가 깊이.
- **리스트 접기** — 같은 부모 밑 같은 종류 형제가 5개 이상이면 대표 하나 + "×N" 배지로 접어 구조를 안정화.
- **host 노드 기본 숨김** — DOM 뷰어가 아니라 "컴포넌트 보드"라는 정체성 유지 (토글 가능).

### 보드 ↔ 실제 화면 양방향 인터랙션
- **노드 → 화면**: 보드 노드를 클릭하면 대응하는 실제 DOM 요소에 하이라이트. **더블클릭**하면 그 요소로 스크롤 이동.
- **화면 → 노드**: 앱에서 `Alt`(⌥)+클릭하거나 "요소 선택" 모드로 클릭하면 대응하는 보드 노드로 자동 이동+강조. (평소 클릭은 전혀 건드리지 않아 앱 조작을 방해하지 않음.)
- **hover 프리뷰** — 픽 모드에서 커서 아래 요소를 실시간 강조("클릭하면 이게 선택된다"를 미리 보여줌).

### 탐색 · 필터
- **검색 하이라이트 + 자동 이동** — 컴포넌트명/도메인명 검색 시 매치 강조 + 나머지 흐림 + 카메라 자동 이동. 접힌 그룹 안에 매치가 있으면 강제로 펼침.
- **그룹 + 개별 필터** — "매치만 표시"로 매치 없는 그룹/노드를 아예 렌더에서 제외.
- **그룹 접기/펼치기**, **우클릭 컨텍스트 메뉴**(그룹: 접기·확대 / 컴포넌트: 화면에서 보기·검색), **캔버스 스티키노트**(자유 배치 메모, localStorage 영속).

### 데이터 흐름 (실험적)
- **props 흐름 추적 + 변경 잔상(afterglow)** — 노드 선택 시 우선순위 정렬 props 패널, prop 클릭 시 자손으로의 참조 추적을 간선 경로로 강조, props 변경이 부모→자식 간선을 타고 흐르는 애니메이션. (Context/외부 스토어 추적은 보류.)

### 시각 언어
- **도형 = 역할**: 라우트 진입 노드는 6각형, 포탈 `⧉`, Suspense 경계 `⏳`, 에러 바운더리 `🛡`.
- **손그림 정체성** — Excalidraw풍 rough.js 스케치 테두리 (노드 수 무관 O(1) 정적 이미지).
- **간선 정리** — 그룹 내 간선은 깊이별 감쇠, 그룹 간 간선은 직교 배선(프레임을 장애물로 회피) + 출발→타깃 도메인 색 그라데이션, hover 시 혈통(조상+자손) 점등.
- **다크모드 + 도메인별 팔레트** — 그룹 이름 해시 기반 8색 고정 팔레트가 프레임·노드·미니맵에 일관 적용.

### 셸
- **도킹 패널** — 화면 하단(기본)/좌/우 사이드바로 위치 전환 + 드래그 크기 조절 (localStorage 영속). **오버레이 전용** — 계측 대상 앱의 레이아웃/CSS는 절대 건드리지 않습니다.
- **고빈도 안정성** — store 갱신을 ~30Hz로 스로틀하고 안 바뀐 노드는 참조를 재사용해 60~240Hz 앱에서도 깜빡임을 억제.

---

## 설치

**dev 전용 도구입니다** — 프로덕션 빌드엔 주입되지 않습니다(다중 가드, [동작 원리](#dev-전용-가드) 참고).

### npm / yarn

```bash
npm install --save-dev react-render-board
npm run dev
```

설치 직후 `postinstall`이 번들러를 감지해 설정을 **자동으로** 넣습니다. 그대로 `npm run dev`만 실행하면 앱 우측 하단에 보드 버튼이 뜹니다.

### pnpm

pnpm은 처음 보는 패키지의 설치 스크립트를 기본 차단합니다(공급망 보안 정책 — `esbuild`·`sharp` 등 설치 스크립트가 있는 대부분의 유명 패키지도 동일하게 겪는 pnpm 표준 절차이며, 이 패키지만의 특이사항이 아닙니다). 한 번만 승인하면 됩니다:

```bash
pnpm install --save-dev react-render-board
pnpm approve-builds --all   # 비대화형 일괄 승인. 고르고 싶으면 `pnpm approve-builds`
npm run dev
```

> ⚠️ **`&&`로 이어 붙이지 마세요.** ignored-builds가 걸리면 `pnpm install`이 **exit code 1**을 돌려주므로(패키지 자체는 정상 설치됨) `&&` 뒤의 `approve-builds`가 조용히 스킵됩니다. 위처럼 줄을 나눠서(또는 `;`로) 실행하세요.

### 수동 설정 (`init`)

자동 설정이 스킵됐거나 다시 확인하고 싶을 때:

```bash
npx react-render-board init
```

`init`(자동이든 수동이든)이 번들러를 감지해 설정을 구성하고, 실행 후 앱 우측 하단 버튼을 누르면 하단 도킹 패널에 실시간 렌더 트리가 그려집니다. **앱 소스 코드는 한 줄도 건드리지 않으며**(설정 파일만 수정), 프로덕션에는 들어가지 않습니다.

---

## 번들러별 설정

`init`이 자동으로 하지만, 무엇을 하는지 알고 싶거나 직접 넣고 싶을 때 참고하세요.

| 번들러 | `init`이 하는 일 | 수동 설정 |
|---|---|---|
| **Vite** | `vite.config`의 `plugins`에 플러그인 추가 | 아래 ① |
| **Next.js / Turbopack** | 루트 `layout.tsx`에 조기 `<head>` 스크립트 + `RenderBoardClient` 배선 | 아래 ② |
| **webpack** | `webpack.config`를 `withRenderBoard(...)`로 래핑 | 아래 ③ |

**① Vite**

```js
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rrbInjectPlugin } from 'react-render-board/vite';

export default defineConfig({
  plugins: [react(), rrbInjectPlugin()],   // dev(serve)에서만 활성
});
```

**② Next.js / Turbopack** — Turbopack엔 플러그인 API가 없어 루트 `layout.tsx`의 `<head>`에 조기 `<script>`를 넣고(초기 커밋부터 버퍼링), `<body>`에 클라이언트 컴포넌트를 배선합니다. `npx react-render-board init`이 이 배선과 `RenderBoardClient.tsx` 생성을 자동으로 처리합니다(수동 편집 권장 안 함).
>
> **`layout.tsx`가 직접 수정되므로 `git status`에 잡힙니다.** 도구를 뗄 때는 `git checkout -- app/layout.tsx`(또는 diff에서 rrb 블록만 제거)로 되돌리세요. 이 변경은 커밋해도 안전합니다 — 스크립트는 `NODE_ENV !== 'production'` 가드로 감싸여 있어 프로덕션 빌드에는 포함되지 않습니다.

**③ webpack**

```js
// webpack.config.js
const { withRenderBoard } = require('react-render-board/webpack');

module.exports = withRenderBoard({ /* 기존 config */ });
```

> 보드 스타일은 `0.2.2`부터 런타임이 스스로 주입합니다 — 어떤 번들러에서도 별도 CSS 설정이 필요 없습니다(css-loader 불필요). 예전 안내로 앱 엔트리에 `import 'react-render-board/style.css'`를 추가했다면 지워도 됩니다(있어도 무해).

---

## 동작 원리

소스 코드(`.jsx` 파일)를 파싱하지 **않습니다.** 대신 브라우저에서 **실행 중인** React 앱이 메모리에 만들어 둔 Fiber 트리를 실시간으로 읽습니다. React가 개발용으로 열어 둔 `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`을 통해 접근합니다.

**3-레이어 구조** (자세한 내용은 [`docs/architecture.md`](docs/architecture.md)):

```
① 훅킹        bippy로 커밋마다 Fiber 트리 접근 + DOM↔Fiber 양방향 매핑
   ↓
② 데이터      Fiber → 정규화된 RenderNode 트리, 소스 경로 기반 groupHint 해석
   ↓
③ 시각화      React Flow(@xyflow) 기반 그룹 프레임 + 노드 + 직교 간선, semantic zoom
```

- **훅킹은 직접 구현하지 않고** 검증된 라이브러리([bippy](https://github.com/aidenybai/bippy))에 위임합니다.
- 실제 제3자 앱 3개(excalidraw · berry-admin · shadcn-admin)에서 콘솔 에러 0건으로 검증됐습니다.

### dev 전용 가드

프로덕션 유출을 막는 다중 가드가 있습니다: Vite 플러그인 `apply: 'serve'`, Next `process.env.NODE_ENV` 정적 제외, 주입 레이어가 세우는 런타임 신호 `__RRB_DEV__`. 프로덕션 번들에는 어떤 형태로도 들어가지 않습니다.

---

## 프로그래밍 방식 API (커스텀 통합)

`init`/postinstall 자동 배선 대신 직접 통합하고 싶을 때. 공개 API는 3-레이어 각각의 진입점만 노출합니다(내부 구현은 재수출하지 않음).

```tsx
import { createRoot } from 'react-dom/client';
import {
  createRenderStore,
  startFiberInspector,
  createInteractionStore,
  startDomClickBridge,
  BoardOverlay,
} from 'react-render-board';
import 'react-render-board/style.css';   // 라이브러리 소비 시 CSS를 직접 import해야 함

const store = createRenderStore();
const interactionStore = createInteractionStore();

startFiberInspector(store, subjectContainer);              // ① 훅킹 시작
startDomClickBridge(subjectContainer, interactionStore);   // 역방향(DOM→보드) 인터랙션, 선택

createRoot(overlayHost).render(
  <BoardOverlay store={store} interactionStore={interactionStore} />
);
```

주요 export:

| 심볼 | 레이어 | 역할 |
|---|---|---|
| `createRenderStore` | 데이터 | 구독 가능한 렌더 트리 스토어 |
| `startFiberInspector` | 훅킹 | 커밋마다 Fiber를 읽어 스토어에 반영 |
| `startDomClickBridge`, `findFiberIdForElement`, `resolveHostElements` | 훅킹 | DOM↔Fiber 매핑(역방향 인터랙션) |
| `Canvas`, `BoardOverlay`, `DomHighlightOverlay` | 시각화 | 보드 UI 컴포넌트 |
| `createInteractionStore` | 시각화 | 노드↔DOM 인터랙션 상태 |
| `createAfterglowStore`, `readFiberProps`, `trackReferenceInDescendants` 등 | 시각화 | props 흐름/변경 잔상(선택) |

타입: `RenderNode`, `RenderSnapshot`, `FiberKind`, `RenderStore`, `InteractionStore`, `PropRow` 등도 함께 export됩니다. 전체 목록은 [`src/index.ts`](src/index.ts) 참고.

---

## 호환성

**추가 스키마 변경 없이** 다음 React 패턴을 커버합니다(실제 앱으로 검증):

- 함수형 / class 컴포넌트, 에러 바운더리
- Concurrent 기능: `useTransition`, `use()` + Suspense
- `React.lazy` 코드 스플리팅 경계
- 포탈(논리적 부모 아래 정확히 배치)
- `memo` / `forwardRef`(정확한 이름 표시)

**React 18 · 19** 지원 (peerDependencies `^18 || ^19`).

---

## 요구사항 · 한계

- **React 전용.** 기술 스택 전체가 React Fiber 내부 구조에 묶여 있습니다(구조적 제약이며 초기 선택 사항이 아님). Vue/Svelte 등은 각 프레임워크별 별도 구현이 필요합니다.
- **dev 전용.** `getSource` 기반 그룹핑이 개발 빌드에서만 동작하며, 프로덕션엔 주입되지 않습니다.
- **규모.** 소~중 규모(수백 개 노드)는 견고합니다. 대규모(수천~9,000+ 노드)도 뷰포트 기반 부분 렌더링으로 응답성이 평탄화되지만(P0~P4 수정 반영), 그룹이 매우 많을 때 지도 모드 라벨 겹침(declutter)은 부분 완화 상태입니다.
- **고빈도 갱신.** 실질 한계는 ~30Hz 스로틀 캡입니다(60~240Hz 앱도 동작하되 갱신이 스로틀됨).
- Node.js ≥ 18.
- 런타임 의존성: `@xyflow/react`, `bippy`, `roughjs`.

---

## 프로젝트 상태

🚀 **npm 배포됨 (`0.2.0`, MIT).** 엔진(훅킹→데이터→시각화) 완성 + 3개 번들러(Vite/Turbopack/webpack) `install`→캔버스 실측 완료. vitest 유닛 테스트 335개.

- [x] 기술·UI 검증, 라이브 MVP, 실제 제3자 앱 검증(excalidraw / berry-admin / shadcn-admin)
- [x] 확인된 결함 5건(P0~P4) 해소 + 테스트 커버리지 + 패키지 배포 준비
- [x] 배포 진입 경험: postinstall 자동 설정 + 3개 번들러 원커맨드
- [ ] 실사용/도그푸딩 + 생존 전략 결정 (완성 우선 기조로 의도적 보류 중)

전체 현황은 [`docs/project-status.md`](docs/project-status.md)를 참고하세요 — 지금까지의 모든 조사·실험·검증·결정을 요약한 살아있는 스냅샷이며, 개별 [ADR](docs/decisions/)로 링크됩니다.

---

## 문서

| 문서 | 내용 |
|---|---|
| [`docs/project-status.md`](docs/project-status.md) | **현황 종합** — 검증 결과·확인된 결함·방향 (여기부터 읽기) |
| [`docs/vision.md`](docs/vision.md) | 풀려는 문제와 목표 |
| [`docs/architecture.md`](docs/architecture.md) | 3-레이어 구조와 동작 원리 |
| [`docs/ui-philosophy.md`](docs/ui-philosophy.md) | UI 철학과 레퍼런스 |
| [`docs/roadmap.md`](docs/roadmap.md) | 단계별 계획 |
| [`docs/research/`](docs/research/) | 배경 조사(선행 프로젝트·기술 옵션) |
| [`docs/decisions/`](docs/decisions/) | 주요 의사결정 기록(ADR) |

---

## 개발 (이 레포에서)

```bash
npm run dev          # 라이브 MVP (좌: 계측 대상 데모 앱, 우: 실시간 보드)
npm run build        # 타입체크 + 빌드
npm run typecheck    # 타입체크만 (tsc -b) — 커밋 전 1회 권장
npm run build:lib    # 라이브러리 빌드 (src/index.ts 공개 API → dist-lib/)
npm run lint         # oxlint
npm run test         # 레이어별 유닛 테스트 (vitest)
npm run verify       # 자체 fixture 회귀 검증 (Playwright, dev 서버 실행 중이어야 함)
```

> `npm run test`(vitest)는 타입을 스트립하므로 타입 오류를 못 잡습니다. **커밋 전 `npm run typecheck`를 1회** 돌리세요.

---

## 라이선스

[MIT](LICENSE) © yoonjaehong26
