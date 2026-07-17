# ADR-0024: 보드 ↔ 실제 DOM 양방향 인터랙션 + MVP 데이터 스코프 경계

- 상태: 채택됨(방향성 — 실제 구현·QA는 다음 라운드에서 진행)
- 날짜: 2026-07-17

## 맥락 (Context)

`docs/decisions/0020-distribution-entry-ux-direction.md`가 배포/진입 UX를 정하면서 "웹 요소 클릭 → 다이어그램에서 바로 찾기" 기능을 같은 페이지 구조를 택하는 근거로 이미 인용했지만, 그 기능 자체의 설계는 다루지 않았다. 이번 대화에서 그 기능을 구체화하기 전에 몇 가지를 재확인했다.

**1. 실제 검증 스크린샷 확인.** `experiments/real-app-validation/excalidraw/`(제3자 오픈소스 앱, ADR-0009 검증용)에 붙어 실행 중이던 `_react-render-board/mount.tsx`를 사용자가 우연히 발견했다 — 우하단 "render-board 열기" 버튼 → 전체화면 오버레이로 캔버스가 펼쳐지는 구조로, ADR-0020이 오늘 결정한 것과 거의 동일한 인터랙션이 이미 검증용 코드로 존재했다. Excalidraw 자체는 이 프로젝트의 일부가 아니라 순수 시험 대상(guinea pig)임을 재확인.

**2. 데이터 스코프 한계 재확인.** `RenderNode`는 구조(id/displayName/kind/parentId/groupHint)만 담고 있어 부모-자식 "구조"는 항상 보이지만:
   - props 값/변경 이력은 캡처되지 않는다(단, `fiber.memoizedProps`/`fiber.alternate.memoizedProps`로 접근 가능한 데이터라 스키마 확장만 하면 되는 선행 작업 수준의 문제).
   - Zustand 같은 상태 저장소는 React 컴포넌트가 아니라 Fiber 트리 자체에 없어 원천적으로 안 보인다.
   - Context Provider는 `isCompositeFiber` 필터링에 의해 현재 파이프라인에서 제외되어 있다(ADR-0007).

**3. Prior art 재검토.** `docs/research/prior-art.md`가 이미 정리해 둔 대로, "실시간 + 캔버스형 박스 다이어그램"을 시도한 프로젝트 8개(React-Sight, Realize, Reactron, ReactMonitor, react-visualizer, ReacTree, react-dom-visualizer, rch)는 거의 다 죽었고, 실제로 성공한 인접 도구들은 전부 **"전체 조망"과 "지금 화면 인터랙션" 중 하나만** 골랐다는 게 이번 대화에서 재조명됐다 — React DevTools는 리스트 뷰(조망 없음), React Scan(21.7k 스타)은 실제 DOM 위에 바로 오버레이(별도 캔버스 없음). 이 프로젝트처럼 "지도 모드가 있는 캔버스"와 "실제 화면 인터랙션"을 **둘 다** 하려는 시도는 상대적으로 이례적이다.

## 검토한 대안 (Options)

- **DOM 오버레이만(React Scan 방식 그대로)** — 기각(부분 채택은 아래). 지금 화면에 보이는 것만 보여줄 수 있어, 이 프로젝트의 핵심 가치("낯선 코드베이스 전체 구조를 지도처럼 조망")를 못 준다 — 화면 밖/미마운트/숨겨진 구조는 원리적으로 표현 불가.
- **캔버스만(지금 MVP 그대로)** — 기각. prior-art.md의 죽은 8개 프로젝트와 같은 계열이 될 위험 — 실제 화면과의 연결이 없어 "이게 화면의 뭘 가리키는지" 감각이 끊긴다.
- **양방향 결합(채택)** — 정방향(보드에서 노드 클릭 → 실제 화면 요소 하이라이트)과 역방향(실제 화면 요소 클릭 → 보드에서 해당 노드로 자동 이동+하이라이트)을 모두 지원. 둘 다 React가 각 DOM 노드에 심어두는 `__reactFiber$<random>` 프로퍼티 + `__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers`의 `findFiberByHostInstance`라는 동일한 조회 메커니즘 하나로 구현 가능(React DevTools의 "요소 선택" 기능과 동일 원리).

## 결정 (Decision)

**보드와 실제 DOM 사이의 양방향 인터랙션을 다음 라운드 UI 구성의 최소 스펙으로 삼는다.**

1. 정방향: 보드 노드 클릭 → 대응 DOM 요소에 하이라이트.
2. 역방향: 실제 DOM 요소 클릭(또는 호버) → 보드가 열리며 해당 노드로 자동 이동 + 하이라이트, 그리고 그 요소 자체에도 React Scan 스타일의 가벼운 테두리를 그린다.
3. ADR-0020의 "같은 페이지 + 전체화면 오버레이" 결정 덕분에 두 UI가 동시에 화면을 다투는 문제는 구조적으로 없다 — 보드가 닫혀 있으면 실제 페이지(+ 가벼운 DOM 오버레이)만 보이고, 열리면 캔버스가 전체를 덮어 실제 페이지가 안 보인다.
4. 전환 시 공간 감각이 끊기지 않도록, 클릭한 요소의 위치에서 해당 캔버스 노드로 이어지는 짧은 전환 애니메이션을 넣는다(`fitView`/`setCenter`가 이미 지원하는 `duration`/`ease` 옵션으로 충분).
5. DOM 오버레이 모드는 **"요소 하나 강조"로 범위를 제한**한다 — 그룹/도메인 경계(예: "이 영역 전체가 Checkout 도메인")를 실제 페이지 위에 그리려 하지 않는다. 캔버스의 역할(전체 구조 조망)을 침범하지 않고, 실제 화면에 그리면 흩어진 요소들 때문에 지저분해지기 쉽다.

## 근거 (Rationale)

- prior-art.md가 확인해 준 대로, "전체 조망"과 "지금 화면 인터랙션"을 둘 다 하려던 선행 프로젝트는 죽었고, 하나만 고른 도구(React DevTools, React Scan)는 살아남았다. 이 프로젝트가 굳이 "둘 다"를 시도한다면, 최소한 서로의 역할을 침범하지 않도록 경계를 분명히 해야 한다 — 위 결정 5번이 이를 명시한다.
- 데이터 스코프 한계(props/state, Zustand, Context)는 "구조"를 양방향으로 연결하는 이번 기능에는 영향이 없다 — `parentId` 기반 구조는 지금 데이터로 바로 가능하다. 다만 "이 요소가 어떤 상태에 의존하는지"까지 보여주는 건 스코프 밖이며, 별도 선행 작업(props 스키마 확장, Context 필터링 해제)이 있어야 의미가 생긴다는 걸 명확히 해 둔다.
- 같은 `__reactFiber$`/`findFiberByHostInstance` 메커니즘 하나로 정방향·역방향을 다 구현할 수 있어 추가 인프라 비용이 크지 않다.

## 결과 (Consequences)

- **다음 UI 구성 라운드의 최소 스펙**: (a) 보드→DOM 하이라이트, (b) DOM→보드 자동 이동+하이라이트, (c) 전환 애니메이션, (d) DOM 오버레이는 요소 단위로 제한.
- **이번 ADR의 스코프 밖(후속 과제로 명시)**: props 값/변경 이력 캡처, Zustand 가시화, Context consumer 자동 추적(Fiber `dependencies` 순회) — 전부 별도 스키마/기능 확장이 필요하며 이번 결정에 포함되지 않는다.
- **되돌리기 쉬움**: 이 결정은 데이터 스키마가 아니라 인터랙션 패턴 설계라 되돌리기 쉬운 축에 속한다(`ui-philosophy.md`의 구분 기준).
- **관련 문서**: 배포/진입 UX는 [`0020-distribution-entry-ux-direction.md`](0020-distribution-entry-ux-direction.md), 다이어그램 시각 언어는 [`../research/2026-07-17-diagram-notation-conventions.md`](../research/2026-07-17-diagram-notation-conventions.md), 선행 프로젝트 실패 패턴은 [`../research/prior-art.md`](../research/prior-art.md) 참고.
