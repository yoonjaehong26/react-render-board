# 다이어그램 표기법 조사 — 이미 존재하는 컨벤션 서베이

조사일: 2026-07-17
목적: 시각화 레이어의 도형/색상/그룹핑 규칙("다이어그램 문법")이 아직 정해지지 않은 상태에서, 처음부터 직접 발명하기보다 이미 검증된 소프트웨어 아키텍처 다이어그램 표기법 중 빌려올 만한 것이 있는지 조사한다. **코드 변경 없음 — 순수 조사 + 제안.**

방법론: 4개의 독립된 리서치 스레드를 병렬 실행했다 — ① DFD(Data Flow Diagram) 표기법 심화, ② C4 model 심화, ③ JS/React 생태계 자체 시각화 컨벤션(Nx, dependency-cruiser류, Storybook/Bit.dev, Flux), ④ 상태관리 시각화 도구(Redux/XState/Zustand/Context) 선례. 공식 문서·원저·실제 도구 소스코드·원본 이미지를 직접 확인해 교차 검증했다.

## 배경

`docs/decisions/0020-distribution-entry-ux-direction.md`가 배포/진입 UX를 정하는 과정에서, "노드 색상·모양·그룹핑 표현" 자체는 아직 미결정 상태로 남아있다는 게 드러났다. `docs/ui-philosophy.md`도 이 부분("색상, 클러스터링 알고리즘 디테일")을 "되돌리기 쉬운 영역"으로 명시적으로 열어두고 있어, 지금 손으로 처음부터 규칙을 설계하는 대신 기존 표기법을 빌려올 수 있는지 확인할 가치가 있었다.

## 조사 대상과 핵심 발견

### 1. DFD (Data Flow Diagram — Yourdon/DeMarco, Gane-Sarson)

- **정확한 심볼**: Yourdon/DeMarco는 프로세스=원(circle), 데이터 저장소=평행 두 줄(parallel open lines), 외부 개체=사각형("terminator"). Gane-Sarson은 프로세스=둥근 사각형, 데이터 저장소=한쪽만 닫힌 사각형. **원기둥(cylinder)은 두 원조 표기법 어디에도 없다** — ER 다이어그램/플로우차트 계열 심볼이 현대 다이어그램 툴 템플릿에 섞여 들어온 것으로 보인다(2차 출처 기반, 1979년 원저 직접 확인은 못 함).
- **레벨링(leveling)**: Context Diagram(전체를 프로세스 하나로 표현) → Level 1(3~9개 서브프로세스로 분해) → 이하 재귀적 분해. 핵심 규칙은 **balancing** — 상위 다이어그램의 입/출력 흐름이 하위 다이어그램에서 하나도 빠짐없이 보존돼야 한다.
- **라이브 적용 사례**: **확인된 사례 없음.** OWASP Threat Dragon 등 DFD 표기법을 쓰는 도구는 전부 수동 작성 또는 일회성 생성이고, 진짜 실시간인 도구(Datadog/Jaeger 등 APM 서비스맵)는 DFD 표기법 자체를 버리고 범용 노드-엣지 맵을 쓴다. 가장 근접한 학술 사례(code2DFD, 2023)도 "코드 변경 시 재동기화 필요"라 명시해 on-demand이지 live가 아님을 스스로 인정한다.
- **한계**: control flow(순서/조건)·동시성/비동기 표현 불가, encapsulation/composition 개념 없음 — UML/C4가 나온 배경 중 하나.

### 2. C4 Model (Simon Brown)

- **4단계**: Context(시스템 전체) → Container(독립 배포 단위: 웹앱/DB/서비스) → **Component**("a grouping of related functionality encapsulated behind a well-defined interface" — 컨트롤러/서비스 클래스급, 별도 배포 단위 아님, 하나의 container 안에서 같은 프로세스로 실행) → Code(선택적, IDE 온디맨드 생성 권장, 표기법도 가장 헐겁게 정의됨).
- **핵심 발견 — 프론트엔드 실무자의 선행 시도**: Michael Sweeney(*Frontend at Scale*)가 정확히 이 문제(C4의 Component 레벨이 개별 UI 컴포넌트에 안 맞음)를 다루고, Level 3를 "Module"(라우트 단위)로 개명한 뒤 그 아래 Screens→Features→Components 3단을 새로 만들었다. 이는 **저희 "상세 모드"(개별 React 컴포넌트)가 C4의 Component가 아니라 가장 헐겁게 정의된 Code 레벨에 대응**한다는 가설을 뒷받침한다.
- **de facto 색상 관습**(C4 스펙이 강제하는 건 아니지만 Structurizr 기본 테마·C4-PlantUML·Mermaid.js 3개 독립 툴이 전부 같은 헥스코드로 수렴): 줌아웃할수록 진하고 줌인할수록 옅어지는 파랑 그라데이션 — Person `#08427B` → System `#1168BD` → Container `#438DD5` → Component `#85BBF0`. 외부/범위 밖 요소는 항상 회색. 그룹 경계는 점선+회색+투명 채움.
- **라이브 적용 사례**: 역시 없음. Structurizr의 자동 추출 기능(`ComponentFinder`)도 빌드 타임 1회성 정적 분석(바이트코드/AST)이지 연속 갱신이 아니다.

### 3. JS/React 생태계 자체 시각화 컨벤션

- **Nx Project Graph**(Cytoscape.js 기반): app/library를 **색이 아니라 도형**(각진 사각형 vs 둥근 사각형)으로 구분. 폴더 그룹핑 + **같은 폴더를 하나로 접는 composite node**(클릭 시 확장) 지원 — 그룹 접기/펼치기의 실제 구현 선례.
- **dependency-cruiser / madge / arkit**: 전부 정적 Graphviz 렌더링, 색은 도메인이 아니라 **의존성 건강 상태**(있음/없음/순환)를 표현하는 데 씀. madge의 "순환 의존성=빨강"이 가장 널리 재사용되는 관습.
- **Storybook**: 코어에는 컴포넌트 관계 그래프가 없음(서드파티 애드온뿐, 낮은 채택률). **Bit.dev**는 라이브 의존성 그래프 기능이 있으나 공개된 시각 언어 스펙은 없음.
- **Flux 다이어그램**(원본 이미지 직접 확인, facebookarchive/flux): Action/Dispatcher/Store/View 전부 **같은 둥근 사각형**, 역할별 단색으로만 구분 — Action=하늘색, Dispatcher=차콜, **Store=진한 남색**, View=초록. 얇은 노란 화살표, 좌→우 수평 체인 배치. **React 생태계에서 10년 넘게 유일하게 합의된 "스토어" 시각 언어.**

### 4. 상태관리 시각화 도구 선례 (Redux/XState/Zustand/Context)

- Redux/Zustand의 "스토어 → 소비 컴포넌트" 그래프는 시도된 사례(`redux-visualize-tools`, `Zusty`)는 있으나 방치되거나 부트캠프 캡스톤 수준이라 정착된 컨벤션이 아니다.
- **XState(Stately Inspector)**는 박스+라벨 화살표 관습이 잘 정착돼 있고 실제로 라이브 모드(`inspect` 콜백으로 런타임 액터 이벤트 스트리밍)도 있으나, 명시적으로 모델링된 상태 머신에만 적용 가능 — 임의의 Redux/Zustand/Context 데이터에는 그대로 못 옮긴다.
- **React Context를 Fiber `contextDependencies`로 자동 순회해 실제 consumer를 찾아 그래프화하는 공개 사례는 없음** — 사실상 미개척 영역.
- **가장 가까운 실제 선례**: `Atomos` — **React Flow로 구현된** Recoil 시각화 도구. 컴포넌트 트리 + 특정 atom을 구독하는 컴포넌트 하이라이트를 라이브로 보여준다. 기술 스택이 동일해 가장 직접 참고할 가치가 있다.

## 공통적으로 확인된 것 — 가장 중요한 발견

**"실시간/라이브 데이터"와 "정형 아키텍처 다이어그램 표기법(DFD·C4)"을 결합한 선례는 어디에도 없었다.** 두 조사 스레드가 독립적으로 같은 결론에 도달했다 — 정적 표기법 도구는 전부 수동/일회성이고, 진짜 라이브인 도구(APM 서비스맵 등)는 전부 표기법 자체를 버리고 범용 노드-엣지 맵으로 수렴한다. **이 프로젝트가 시도하는 조합("살아있는 Fiber 데이터 + 검증된 시각 언어")은 상대적으로 novel한 영역이다.**

## 제안 — 조합 규칙 (draft, 아직 결정은 아님)

표기법 하나를 통째로 채택하지 않고, 이미 만든 것 위에 검증된 규칙만 얹는다.

| 요소 | 규칙 | 출처 |
|---|---|---|
| 노드 모양 | 전부 둥근 사각형으로 통일(변경 없음) | C4 3개 툴 전부 일치 |
| 그룹 박스 | 회색 점선 테두리(변경 없음) | C4의 경계 관습과 이미 일치 |
| 줌 레벨별 색 농도 | 지도 모드(영역) = 진한 색, 상세 모드(컴포넌트) = 같은 색조의 옅은 버전 | C4: 줌아웃=진함, 줌인=옅음 |
| 라이브러리 내부 흡수 노드 | 회색 | C4·Nx·madge 공통 "범위 밖=회색" |
| 문제 있는 노드(순환 의존성·과도한 리렌더 등, 향후) | 빨강 | madge의 "순환=빨강" |
| 스토어/Context(향후 추가 시) | 남색, 도형은 다른 노드와 동일 | Flux의 "Store=남색" |
| 그룹 접기/펼치기 | 도메인 그룹을 하나로 접기/펼치기 | Nx의 composite node |
| 범례 | 화면 한구석에 색/도형 의미 상시 표시 | C4가 유일하게 강제하는 규칙 |
| 구조 선 vs 데이터 흐름 화살표 | 구조(부모→자식)는 실선 유지, 데이터 흐름(향후)은 별도 스타일 | 혼동 방지, Flux의 화살표 스타일 분리 참고 |

## 관련 문서

- 배포/진입 UX 결정: [`decisions/0020-distribution-entry-ux-direction.md`](../decisions/0020-distribution-entry-ux-direction.md)
- React Flow UX 기능 조사: [`2026-07-17-react-flow-ux-capabilities.md`](2026-07-17-react-flow-ux-capabilities.md)
- UI 철학(색상/클러스터링을 "되돌리기 쉬운 영역"으로 규정): [`ui-philosophy.md`](../ui-philosophy.md)

## 출처

**DFD**
- Yourdon, *Just Enough Structured Analysis* Ch.9 (PDF): https://static1.squarespace.com/static/50c9c50fe4b0a97682fac903/t/512878e6e4b02e5615b4c5ed/1361606886338/Yourdon+DFD.pdf
- Wikipedia, Data-flow diagram: https://en.wikipedia.org/wiki/Data-flow_diagram
- Wikipedia, Structured analysis: https://en.wikipedia.org/wiki/Structured_analysis
- draw.io 공식 문서: https://www.drawio.com/docs/diagram-types/data-flow-diagrams/
- code2DFD (Schneider & Scandariato, JSS 2023): https://arxiv.org/abs/2304.12769
- Koschke 2003 리버스 엔지니어링 서베이: https://onlinelibrary.wiley.com/doi/10.1002/smr.270
- Shostack, trust boundary 비판: https://shostack.org/blog/tmt-data-flow-diagrams/

**C4 model**
- Home / Notation / Component / Code: https://c4model.com/ , https://c4model.com/diagrams/notation , https://c4model.com/abstractions/component , https://c4model.com/diagrams/code
- Simon Brown, InfoQ: https://www.infoq.com/articles/C4-architecture-model/
- Frontend at Scale(프론트엔드 적용 사례): https://frontendatscale.com/issues/17/ , https://frontendatscale.com/courses/frontend-architecture/understanding/the-c4-model/
- Structurizr 테마/노테이션: https://docs.structurizr.com/ui/diagrams/notation , https://static.structurizr.com/themes/default/theme.json
- C4-PlantUML: https://github.com/plantuml-stdlib/C4-PlantUML
- Mermaid.js C4: https://mermaid.js.org/syntax/c4.html
- Structurizr Component Finder: https://github.com/structurizr/java-extensions/blob/master/docs/component-finder.md

**JS/React 생태계**
- Nx Graph: https://nx.dev/docs/features/explore-graph , https://www.npmjs.com/package/@nx/graph
- dependency-cruiser 테마: https://github.com/sverweij/dependency-cruiser/blob/main/src/report/dot/default-theme.mjs
- madge: https://github.com/pahen/madge
- Flux In-Depth Overview: https://facebookarchive.github.io/flux/docs/in-depth-overview/

**상태관리 시각화**
- Stately(XState) Inspector: https://stately.ai/docs/inspector
- Atomos(Recoil, React Flow 기반): https://dev.to/coleredfearn/atomos-a-new-recoil-visualization-tool-powered-by-react-flow-4b6l
- facebook/react PR #28467(context dependencies): https://github.com/facebook/react/pull/28467
