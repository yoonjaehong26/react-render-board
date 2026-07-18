# react-render-board

> React 앱의 **실시간 렌더 트리**를 Figma 같은 보드 위에 박스+선 다이어그램으로 시각화하는 도구

## 한 줄 소개

React DevTools의 들여쓰기 리스트 뷰가 아니라, 컴포넌트 구조를 **공간적으로 배치된 노드 다이어그램**으로 보여줍니다. 새 코드베이스에 처음 들어온 사람이 전체 구조를 한눈에 파악하는 것을 목표로 합니다.

## 설치 & 사용

**dev 전용 도구입니다** — 프로덕션 빌드엔 주입되지 않습니다.

### npm / yarn

```bash
npm install --save-dev react-render-board
npm run dev
```

설치 직후 `postinstall`이 번들러를 감지해 설정을 **자동으로** 넣습니다. 이게 끝입니다 — 그대로 `npm run dev`만 실행하면 앱 우측 하단에 보드 버튼이 뜹니다.

### pnpm

pnpm은 처음 보는 패키지의 설치 스크립트를 기본적으로 차단합니다(공급망 보안 정책 — `esbuild`, `sharp` 등 설치 스크립트가 있는 대부분의 유명 패키지도 동일하게 겪는 pnpm 표준 절차이지 이 패키지만의 특이사항이 아닙니다). 한 번만 승인하면 됩니다:

```bash
pnpm install --save-dev react-render-board
pnpm approve-builds --all   # 비대화형 일괄 승인. 고르고 싶으면 `pnpm approve-builds`
npm run dev
```

> ⚠️ **`&&`로 이어 붙이지 마세요**(`pnpm install ... && pnpm approve-builds --all`). ignored-builds가 걸리면 `pnpm install`이 **exit code 1**을 돌려주므로(패키지 자체는 정상 설치됨) `&&` 뒤의 `approve-builds`가 실행되지 않고 조용히 스킵됩니다. 위처럼 **줄을 나눠서**(또는 `;`로) 실행하세요.

### 수동 실행 (재확인하고 싶을 때 / 자동 설정이 스킵됐을 때)

```bash
npx react-render-board init
```

`init`(자동이든 수동이든)이 번들러별로 설정을 구성합니다:

| 번들러 | 하는 일 |
|---|---|
| **Vite** | `vite.config`의 `plugins`에 `rrbInjectPlugin()` 추가 |
| **Next.js / Turbopack** | 루트 `layout.tsx`에 조기 `<head>` 스크립트 + `RenderBoardClient` 배선 |
| **webpack** | `webpack.config`를 `withRenderBoard(...)`로 래핑 (흔한 CJS 형태 자동, 그 외 안내) |

실행 후 앱 화면 우측 하단의 버튼을 누르면 하단 도킹 패널에 실시간 렌더 트리가 그려집니다. 앱 소스 코드는 한 줄도 건드리지 않으며(설정 파일만 수정), 프로덕션에는 들어가지 않습니다.

> 참고: webpack에서 보드 스타일이 필요하면 `import 'react-render-board/style.css'`를 앱 엔트리에 추가하세요(css-loader 필요). Vite/Next는 자동으로 로드합니다.

## 왜 만드는가

- React DevTools는 강력하지만 텍스트 트리라 "전체 그림"이 직관적으로 안 들어옵니다.
- CodeSee 같은 도구는 `import` 관계(정적 분석) 기반이라 실제 렌더 구조(`children` prop, Context 등)와 일치하지 않습니다.
- "실시간 렌더 트리 + Figma식 캔버스 박스"라는 조합은 여러 팀이 시도했지만 (React-Sight, Realize, Reactron 등) 모두 유지보수가 끊겼습니다. 이 조합은 현재 시장에서 비어 있습니다.

자세한 배경은 [`docs/research/prior-art.md`](docs/research/prior-art.md) 참고.

## 핵심 원리 (요약)

소스 코드(`.jsx` 파일)를 파싱하지 않습니다. 대신 브라우저에서 **실행 중인** React 앱이 메모리에 만들어 둔 Fiber 트리를 실시간으로 읽습니다. React가 개발용으로 열어 둔 `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`을 통해 접근하며, 이 훅킹 레이어는 직접 구현하지 않고 검증된 라이브러리에 위임합니다.

자세한 내용은 [`docs/architecture.md`](docs/architecture.md) 참고.

## 대상 사용자

매일 디버깅하는 베테랑이 아니라, **새 코드베이스에 처음 들어온 사람**입니다. 온보딩, 코드 리뷰, 아키텍처 문서화, 신규 입사자 교육 같은 순간을 위한 도구입니다.

## 범위

**React 전용입니다.** 기술 스택 전체가 React의 Fiber 내부 구조에 묶여 있어, Vue/Svelte 등은 각 프레임워크마다 별도 구현이 필요합니다. (구조적 제약이며, 초기 선택 사항이 아닙니다.)

## 현재 상태

🚦 **판단 지점 통과 (조건부 GO) → 정식 재구현 착수 직전.** 검증용 MVP 코드 있음.

- [x] 실험 1: 기술 검증 (Fiber 트리를 JSON으로 추출)
- [x] 실험 2: UI 검증 (React Flow로 클러스터링 + 줌 프로토타입)
- [x] 라이브 MVP (실험 1 + 2 통합)
- [x] 판단 지점: 실제 제3자 앱 검증 (excalidraw / berry-admin / shadcn-admin)
- [ ] 정식 재구현 (확인된 결함 5건 반영 + 생존 전략 결정 후)

전체 현황은 [`docs/project-status.md`](docs/project-status.md), 로드맵은 [`docs/roadmap.md`](docs/roadmap.md) 참고.

## 문서 안내

| 문서 | 내용 |
|---|---|
| [`docs/project-status.md`](docs/project-status.md) | **현황 종합** — 지금까지의 검증 결과·확인된 결함·앞으로의 방향 (여기부터 읽기) |
| [`docs/vision.md`](docs/vision.md) | 프로젝트가 풀려는 문제와 목표 |
| [`docs/architecture.md`](docs/architecture.md) | 3-레이어 구조와 동작 원리 |
| [`docs/ui-philosophy.md`](docs/ui-philosophy.md) | UI 철학과 레퍼런스 |
| [`docs/roadmap.md`](docs/roadmap.md) | MVP 단계별 계획 |
| [`docs/research/`](docs/research/) | 배경 조사 (선행 프로젝트, 기술 옵션) |
| [`docs/decisions/`](docs/decisions/) | 주요 의사결정 기록 (ADR) |

## 라이선스

[MIT](LICENSE)
