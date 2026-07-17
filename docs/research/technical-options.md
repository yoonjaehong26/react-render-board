# 기술 옵션 조사

## 훅킹 레이어 후보

렌더 트리에 접근하는 방법. 직접 구현하지 않고 아래 중 하나에 위임한다.

### bippy

- react-scan 제작자(aidenybai)가 만든 툴킷. "react devtools인 척"하며 Fiber 트리에 접근.
- `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`을 안전하게 monkey-patch.
- 주요 유틸: `instrument`(안전한 패치), `secure`(try/catch 래핑으로 앱 크래시 방지), `traverseFiber`/`traverseRenderedFibers`, `traverseProps/State/Contexts`, `getDisplayName`, `getFiberSource` 등.
- 모던 React(v17–19) 지원. ~4kb gzip. 활발히 관리(최근 배포 있음).
- ⚠️ React 내부에 의존하므로 프로덕션에서 앱을 깨뜨릴 수 있음 — `secure`로 가드 필수.
- react 이전에 import 되어야 함 (Vite: 엔트리 최상단 / Next 15.3+: `instrumentation-client.ts`).

### react-devtools-core

- Meta 공식 유지보수. `backend` / `standalone(frontend)` 두 진입점.
- 더 보수적/안정적. Manifest V3 대응 완료. React 19 신규 훅 지원 확인됨.
- 주간 다운로드 다수, 메인테이너 여럿.

### 관련 참고

- **react-devtools-inline** — frontend/backend를 iframe 기반으로 임베드. 다만 experimental API 의존.
- **its-fine** (pmndrs) — React 내부에서 hook으로 fiber 접근.

### 선택 방향

MVP 실험 단계에서 bippy로 빠르게 검증하고, 안정성이 중요해지면 react-devtools-core와 비교. 최종 결정은 [`../decisions/0002-hooking-layer.md`](../decisions/0002-hooking-layer.md)에 기록 예정.

## 시각화 레이어

### React Flow (xyflow)

- 노드 기반 UI의 사실상 표준. 드래그 노드, 커스텀 엣지, 줌/팬 내장.
- 상용 제품 다수가 이 위에서 제작됨.
- 선행 프로젝트들이 D3를 로우레벨로 다룬 것과 달리, 레이아웃 엔진을 새로 짤 필요 없음.

### 참고할 D3 코드 (레퍼런스용, fork 아님)

- React-Sight, Realize — 모두 MIT. tree layout 접근 방식 참고 가능.

## Fiber 구조 메모

Fiber 노드의 주요 필드 (bippy README 기준):

- `type` — 컴포넌트 타입(함수/클래스)
- `child` / `sibling` / `return` — 트리 포인터 (자식 / 형제 / 부모)
- `stateNode` — host fiber (예: DOM 요소)
- `alternate` — 더블 버퍼링된 이전/현재 버전
- `memoizedProps` / `memoizedState` / `dependencies` — props / state / contexts

주의: 부모는 첫 번째(왼쪽) 자식으로의 링크만 갖고, 나머지 자식은 sibling 체인으로 연결됨. 트리 순회 시 이 구조를 따라야 함. (bippy의 `traverse*` 유틸이 이를 추상화해줌.)

## 문서화 방식 결정 배경

- **Notion MCP** — 최근 토큰 효율 개선(마크다운 API 등)됐지만, API 왕복 오버헤드 + 코드/문서가 분리돼 PR 하나로 리뷰 불가 → 오픈소스 흐름에 부적합.
- **Obsidian** — 개인 사고 정리엔 좋으나 "공식 프로젝트 문서"로는 진입장벽. 단, vault를 레포 `docs/`로 지정하면 겸용 가능.
- **GitHub 레포 `.md`** ← **채택.** 로컬 파일이라 AI 에이전트가 오버헤드 없이 읽고, 코드+문서를 같은 PR로 버전 관리·리뷰 가능.
