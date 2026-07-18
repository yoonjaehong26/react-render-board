# 0069. 런타임 CSS 자기주입 + webpack entry 순서 수정

- 날짜: 2026-07-19
- 상태: 승인됨
- 관련: [ADR-0036](0036-distribution-connection-implementation.md)(주입 경로들), [ADR-0068](0068-next-devtools-root-pollution-fix.md)(같은 실사용 라운드)

## 맥락 — 실사용(coverLetter, Vite + 별도 webpack 세팅)에서 나온 결함 2건

1. **보드가 스타일 없이 깨져 보임(Vite·webpack 공통).** 라이브러리 CSS는 `build:lib`이 `dist-lib/index.css`로 추출하고(`exports["./style.css"]`), JS 런타임은 그걸 로드하지 않는다 — 로드는 주입 경로가 각자 챙겨야 했는데 **Vite 플러그인은 JS만 주입**했고, **webpack 헬퍼는 entry에 CSS를 얹지 않았다**(css-loader 유무를 라이브러리가 알 수 없어 의도적으로 뺐던 것이 방치됨). Next 경로만 RenderBoardClient가 style.css를 import해 멀쩡했다. 기존 e2e가 "캔버스 노드 수"만 단언해 스타일 깨짐이 검증을 통과해온 것도 함께 드러났다.
2. **webpack에서 렌더 트리 0개.** `withRenderBoard`가 런타임을 entry "뒤에" 붙여 [앱, 런타임] 순서가 됐는데, React DevTools 확장이 이미 훅을 선점한 환경(조기 스크립트가 새 훅을 못 심음)에서는 런타임이 앱의 최초 커밋을 놓친다. 소비자가 [style, 런타임, 앱] 순서로 바꿔 동작을 실측으로 복구했다.

## 결정

1. **CSS는 런타임이 자기주입한다** (`src/inject.tsx`): `@xyflow/react/dist/style.css`와 `flow.css`를 `?inline`으로 문자열 번들해 부팅 시 `<style id="rrb-styles">`로 1회 주입(멱등 가드). dev 전용 도구라 런타임 `<style>` 주입이 정당하고, **번들러·로더 구성과 무관하게 어떤 주입 경로에서든 스타일이 항상 함께 온다** — 이 결함 부류 자체가 사라진다. `exports["./style.css"]`(index.css)는 수동 배선 소비자용으로 유지. 소비자가 style.css를 별도로 로드해도 같은 규칙 중복이라 무해.
   - 기각한 대안: webpack entry에 `react-render-board/style.css`를 기본 추가 — **css-loader 없는 소비자의 빌드를 즉시 깨뜨린다**(자체 스파이크가 정확히 그 구성). 옵션으로 열어두는 것도 "기본값이 결함"인 상태를 유지하므로 기각.
2. **Vite 플러그인의 style.css 동시 import는 유지** (`cli/vite.mjs`, 병행 세션이 실사용 프로젝트에서 검증한 수정) — 자기주입과 중복되지만 무해하고, 이중 방어가 된다.
3. **webpack entry 순서를 [런타임, ...앱]으로** (`cli/webpack.cjs` `addEntry` prepend화, 멱등 유지) — 조기 스크립트가 무력한 환경에서도 최초 커밋을 잡는다. 객체형 entry는 보드 키를 맨 앞에 둔다.
4. **e2e에 CSS 단언 추가** — `verify:init`(Vite)과 `verify:init-webpack`에 `.board-fab`의 computed `border-radius: 50%` 확인. 특히 webpack 스파이크는 css-loader가 없으므로 자기주입의 결정적 검증 무대다("스타일 없이 뜨는 게 정상"이던 기존 기대값을 뒤집음).

## 검증

- `verify:init-webpack`: css-loader 없는 스파이크에서 CSS 적용 + 캔버스 + entry 순서 회귀 통과.
- `verify:init`(Vite): CSS 단언 포함 통과.
- `withRenderBoard` entry 형태별(string/array/object/function/멱등/prod) node 스모크 8케이스 통과.
- `npm run typecheck` + vitest 342개 통과. `dist-lib/inject.js`에 CSS 인라인 실측(1.5kB→45.9kB, index.css 43.6kB 별도 유지).

## 소비자 안내

- coverLetter처럼 entry에 `react-render-board/style.css`를 수동으로 얹은 프로젝트는 0.2.2부터 그 줄을 지워도 된다(있어도 무해).
- webpack 소비자의 css-loader 관련 조치는 더 이상 불필요.
