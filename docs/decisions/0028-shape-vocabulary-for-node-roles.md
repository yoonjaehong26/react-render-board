# ADR-0028: 노드 도형 어휘 — "역할"을 도형으로, "구현 방식"은 색/질감으로

- 상태: 채택됨. 라우트 6각형 + **포탈 표식 + 경계(Suspense/에러 바운더리) 구별선 전부 구현됨**([ADR-0035](0035-shape-and-hand-drawn-implementation.md)). 실측 결과 포탈/경계도 스키마 변경 없이 `fibersById` 사이드채널 파생으로 가능해(당초 예측한 `classify`/스키마 변경 불필요) 이번에 함께 구현했다.
- 날짜: 2026-07-18

## 맥락 (Context)

사용자가 예전에 손으로 정리하던 Figma 다이어그램의 4대 가독성 기법(① 도형=유형, ② 색상=기능, ③ 실선/점선 정리, ④ 배경=기능 묶기)을 이 프로젝트에 어떻게 옮길지 논의하는 과정에서 나온 결정이다. 이 중:

- ② 색상 / ④ 배경(도메인=색)은 이미 [ADR-0027](0027-search-and-theme-ux-round.md)의 도메인 팔레트(`groupColor.ts`)로 구현됐다.
- ③ 실선/점선 정리(직교 배선)는 별도 조사 중이다([`../research/2026-07-18-orthogonal-edge-routing.md`](../research/2026-07-18-orthogonal-edge-routing.md)).
- 선 질감(손그림)은 rough.js로 다뤘다([`../research/2026-07-18-excalidraw-visual-identity.md`](../research/2026-07-18-excalidraw-visual-identity.md)).

남은 게 ① **도형 = 유형**이다. 현재 모든 컴포넌트 노드는 똑같은 사각형이고(host 노드는 기본 숨김), 유형을 도형으로 구분하지 않는다.

**제약 1 — 우리가 볼 수 있는 것은 Fiber 트리뿐.** Zustand/Redux 같은 상태 저장소, fetch/API 같은 외부 통신은 React 컴포넌트가 아니라 Fiber 트리에 없어 도형으로 그릴 대상 자체가 없다(사용자 Figma의 "원기둥 스토어"는 원천적으로 재현 불가). Context Provider는 트리에 있으나 현재 필터링돼 있다([ADR-0007](0007-grouping-hint-feasibility.md)).

**제약 2 — 도형 예산은 작다.** 사람이 한눈에(preattentive) 구별하는 도형은 4~5개가 한계다. 유형을 전부 도형화하면 노드판이 노이즈가 된다 — [`../research/prior-art.md`](../research/prior-art.md)가 정리한 "대형 앱에서 박스+선이 스파게티가 된다"는 실패의 노드 버전이다.

**통찰 — 3채널은 서로 다른 줌 레벨에서 일한다.** semantic zoom(지도↔상세, [ADR-0018](0018-map-mode-lod-and-camera-refit.md)) 위에서 시각 채널을 분업시키면:

| 채널 | 나타내는 것 | 작동하는 줌 |
|---|---|---|
| 색 / 배경 | 도메인(기능) | 지도 + 상세 둘 다 (지도 모드에선 그룹 프레임이 색 유지) |
| **도형** | 구조적 역할 | **상세 모드에서만** (지도 모드엔 개별 노드가 안 보임) |
| 테두리 질감 | 부차 상태(anonymous/pending 등) | 상세 모드, 보조 |

즉 색은 "멀리서 보는 지도"를, 도형은 "가까이서 읽는 상세"를 책임진다 — 중복이 아니라 분업이다. 그래서 도형을 지도 모드에서도 읽히게 만들 필요가 없다(애초에 그 역할이 아니다).

## 검토한 대안 (Options)

**도형 어휘의 범위:**

- **최소 — 구조적 이음새만(3~4종)** — 채택. 일반 컴포넌트=사각형, 라우트 진입점=6각형, 경계(Suspense/Lazy/ErrorBoundary)=구별 외곽선, (+포탈=표식). 나머지 유형 차이는 색/뱃지/테두리로.
- **풀 — 렌더 타입까지(6~7종)** — 기각. memo·class·forwardRef까지 도형/뱃지로 구분. 정보량은 많지만 preattentive 한계(4~5종)를 넘겨 노드판이 복잡해지고 학습 부담이 커진다.
- **색만 — 전부 사각형** — 기각. 가장 단순하지만 사용자 Figma의 "6각형 라우트" 같은 '형태로 즉시 인지' 효과를 포기한다. 라우트 진입점은 앱 구조 이해의 출발점이라 형태로 구분할 값어치가 있다.

**"만든 방식"을 도형으로 줄지:**

- memo/class/forwardRef는 이게 *무슨 일을 하나*(역할)가 아니라 *어떻게 만들어졌나*(구현 방식)라, 도형이 아니라 색/뱃지/테두리 질감으로 미룬다.

**스토어/Context를 도형으로 줄지:**

- 스토어(원기둥) — 기각(원천 불가, 제약 1).
- Context Provider(마름모) — **보류(별도 실험)**. 필터를 다시 열면([ADR-0007](0007-grouping-hint-feasibility.md) 되돌리기) "트리 안 데이터 방송점"만큼은 표현 가능하나, 노이즈를 늘릴 위험이 있어 이번 결정에 포함하지 않고 별도로 검증한다.

## 결정 (Decision)

**도형은 "역할(role)"에만 부여하고, "구현 방식"은 색/뱃지/테두리로 미룬다.** 구체적 어휘:

| 역할 | 도형 | 판별 방법 |
|---|---|---|
| 일반 컴포넌트 | 사각형(기본) | 대다수 composite |
| 진입점(route) | 6각형 | `groupHint`가 `app/.../page.tsx`로 끝남 (사용자 Figma 그대로) |
| 경계(boundary) | 구별 외곽선 | Suspense / Lazy / ErrorBoundary |
| 포탈(portal) | 표식 | Portal fiber(화면 다른 곳으로 렌더) |
| host(div/span) | 기본 숨김(기존) | `kind === 'host'` |

memo/class/forwardRef 등 "만든 방식"은 도형 대신 색/작은 뱃지/테두리 질감으로 표현한다. 도형은 상세 모드 전용 채널로 취급하고, 지도 모드의 유형 인지는 색/배경에 맡긴다.

## 근거 (Rationale)

- **역할 ≠ 구현 방식.** 도형은 인지 비용이 큰 채널이라, "이게 앱에서 무슨 자리인가"(진입점/벽/탈출구)라는 구조적 역할에만 써야 값어치가 산다. "memo로 감쌌나"는 그 자리 이해에 부차적이다.
- **preattentive 예산(4~5종)을 지킨다.** 3~4종으로 묶으면 한눈에 구별되고, 그 이상은 오히려 리스트 뷰보다 못한 노이즈가 된다(prior-art 교훈의 노드 버전).
- **줌 레벨 분업.** 도형은 상세 모드에서만 보이므로 지도 모드 가독성을 신경 쓸 필요가 없고, 지도 모드의 유형 구분은 이미 색/배경이 담당한다 — 두 채널이 겹치지 않고 각 줌을 나눠 맡는다.
- **6각형 라우트는 공짜에 가깝다.** 이미 있는 `groupHint` 경로만으로 판별되어 데이터 스키마를 안 건드린다 — 사용자 Figma에서 가장 인상적이던 표기를 가장 싸게 재현한다.

## 결과 (Consequences)

**구현 비용 그라디언트(단계 착수 순서의 근거):**

1. **라우트 6각형 — 가장 쌈, 1순위.** `groupHint` 경로 판별식 하나. `RenderNode` 스키마 변경 없이 시각화 레이어에서 파생 가능.
2. **포탈 표식 — 중간.** Portal fiber가 현재 파이프라인에서 노드가 되는지(host로 분류되는지)부터 실측 확인 필요 — 안 되면 `serialize.ts`의 `classify` 처리 추가. **실측 없이 단정하지 않는다**(CLAUDE.md 원칙).
3. **경계(Suspense) 도형 — 가장 비쌈.** Suspense는 현재 `classify`에서 `kind === null`로 걸러진다([ADR-0007](0007-grouping-hint-feasibility.md)/`serialize.ts`) — 도형을 주려면 필터를 여는 선행 작업이 필요하다. ErrorBoundary는 class 컴포넌트라 이미 노드로 남지만 별도 표시가 없어 감지 로직이 필요하다.

**데이터 스키마 영향.** 역할을 `RenderNode`에 필드(`role`)로 넣을지, 시각화 레이어에서 파생할지는 구현 시 결정한다 — 라우트/포탈은 파생 가능하나, 경계는 데이터 레이어(`classify`) 변경이 필요하다. `RenderNode` 스키마 확장은 architecture.md가 "되돌리기 어려운 결정"으로 고정한 영역이라, 파생으로 될 것은 파생으로 처리해 스키마 확장을 최소화한다.

**되돌리기 쉬움/어려움.** 도형↔역할 매핑 자체는 순수 프레젠테이션이라 되돌리기 쉽다(ui-philosophy.md 기준). 예외는 경계 도형을 위한 `classify` 확장뿐 — 이것만 데이터 레이어 변경이라 상대적으로 더 신중해야 한다.

**스코프 밖(명시적으로 안 함):** 스토어(원기둥, 원천 불가), Context 마름모(별도 실험으로 보류), memo/class/forwardRef의 도형화(색/뱃지로 미룸).

**관련 문서:** 시각 스킨(선 질감·색·폰트)은 [`../research/2026-07-18-excalidraw-visual-identity.md`](../research/2026-07-18-excalidraw-visual-identity.md), 색 규칙 초안은 [`../research/2026-07-17-diagram-notation-conventions.md`](../research/2026-07-17-diagram-notation-conventions.md), 도메인 팔레트 구현은 [ADR-0027](0027-search-and-theme-ux-round.md), Context/Suspense 필터링 배경은 [ADR-0007](0007-grouping-hint-feasibility.md) 참고.
