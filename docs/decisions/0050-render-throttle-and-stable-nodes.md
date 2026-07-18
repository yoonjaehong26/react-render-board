# ADR-0050: 고빈도 흰 깜빡임 수정 — notify 스로틀 + 안 바뀐 노드 참조 재사용

- 상태: 채택됨
- 날짜: 2026-07-18

## 맥락 (Context)

사용자 보고: 계측 대상 앱이 계속 렌더링(예: LiveFeed 20~240Hz)할 때 **간헐적 흰색 깜빡임**이 생긴다. "React는 키로 필요한 부분만 리렌더하지 않나?"라는 합당한 의문과 함께.

**추측 대신 실측했다.** ComponentNode/BoardContent에 임시 렌더 카운터를 넣고 240Hz LiveFeed로 재현:

- 유휴: BoardContent 6회/초, ComponentNode 15회/노드/초.
- **240Hz 부하: BoardContent 174회/초, ComponentNode 425회/노드/초.**

데이터 소스(store)는 ~10Hz여야 하는데 그 17~42배로 재렌더되고 있었다. Playwright 스크린샷(30~60ms 간격)으론 흰 프레임이 안 잡혔다 — sub-frame(≤16ms) 리페인트 아티팩트라, 원인은 **과도한 재렌더로 인한 jank/paint 부하**였다.

원인 두 가지:
1. **store notify가 스로틀이 아니었다.** `requestIdleCallback(cb,{timeout:100})`은 "최대 지연 100ms"만 보장할 뿐 "최소 간격"을 강제하지 못한다 — 브라우저가 커밋 사이에 한가하면 커밋률(수백 Hz)만큼 notify가 실행돼 시각화 전체가 그만큼 재렌더됐다.
2. **매 커밋 노드 객체를 새로 만든다.** `toFlow`는 커밋마다 노드 객체를 새로 생성해, 데이터가 그대로여도 참조가 바뀌어 React Flow가 그 노드를 재렌더한다.

## 결정 (Decision)

**두 곳을 고친다:**

1. **store notify 스로틀(`store.ts`)** — 직전 notify로부터 최소 `MIN_NOTIFY_INTERVAL_MS`(33ms, ~30Hz)를 띄운다. 첫 커밋(오래 쉰 뒤)은 즉시 반영되고, 짧은 시간 안의 연쇄 커밋만 묶여 상한 30Hz로 캡된다. snapshot은 handleCommit이 항상 즉시 갱신해 데이터 최신성 유지.
2. **안 바뀐 노드 참조 재사용(`Canvas.tsx`)** — `nodesShallowEqual`로 이전 커밋과 얕게 같은 노드는 **이전 객체 참조를 그대로 재사용**한다. React Flow는 노드 참조가 그대로면 그 노드를 재렌더하지 않으므로(내부 memo), 데이터 안 바뀐 노드는 재렌더+SVG 배경 재래스터를 건너뛴다. 콜백(함수) 값은 비교에서 제외해 매번 새로 만들어지는 핸들러(onToggleCollapse 등)로 그룹 노드가 불필요히 갱신되지 않게 한다.

## 근거 (Rationale)

- **실측 기반.** 두 수정 후 재측정: ComponentNode 425 → **120회/노드/초**(72%↓), BoardContent 174 → 118회/초. 즉 데이터가 안 바뀐 노드의 불필요한 재렌더를 대폭 줄였다.
- **흰 플래시의 실제 성격.** 재렌더돼도 `backgroundImage` 값이 그대로면 React가 DOM 스타일을 다시 안 쓰므로 SVG 재래스터는 안 일어난다 — 즉 깜빡임은 "스타일 값 변경"이 아니라 "과도한 재렌더로 인한 paint/jank 부하"의 산물이었고, 그 부하를 줄이는 게 정공법이다.
- **데이터 정확성 불변.** 스로틀은 notify 타이밍만 늦출 뿐 snapshot은 항상 최신(handleCommit 동기 갱신). 노드 재사용은 얕게 같을 때만이라 실제 변경은 반영된다.

## 결과 (Consequences)

- **바뀐 것**: `store.ts`(notify 스로틀), `Canvas.tsx`(`nodesShallowEqual` + `stableFlowNodes` 메모). 데이터 스키마·시각 표현 불변.
- **남은 재렌더(120회/노드/초)**: 다른 세션이 얹은 컨텍스트 구독(afterglow/lineage/pageHovered, ADR-0032/0044/0047)이 원인 — 그 Provider가 매 렌더 새 값을 내려 consumer(ComponentNode)를 재렌더시킨다. 스타일 값은 안 바뀌어 흰 플래시로 직결되진 않으나, 남은 CPU 낭비는 그 Provider들을 memoize하면 더 줄일 수 있다(후속, 그 기능 소유 세션과 조율).
- **검증**: `tsc` 클린, 유닛 테스트 291개 통과. 재렌더율 실측 감소 확인. 흰 플래시 자체는 sub-frame이라 자동 스크린샷으로 못 잡으므로 **실제 브라우저에서 사용자 확인 권장**.
- **트레이드오프**: notify를 30Hz로 캡하면 단발 커밋에도 최대 33ms 지연이 생길 수 있다 — 렌더 트리 뷰어엔 무시할 수준(첫 커밋은 즉시).
- **되돌리기 쉬움**: 스로틀 상수 하나, 메모 레이어 하나. 각각 국소.
- **관련 문서**: 고빈도 스트레스 [ADR-0013](0013-high-frequency-render-stress-test.md), 뷰포트 부분 재계산 [ADR-0017](0017-viewport-based-partial-recompute.md), 변경 잔상 컨텍스트 [ADR-0032](0032-props-flow-and-change-afterglow.md).
