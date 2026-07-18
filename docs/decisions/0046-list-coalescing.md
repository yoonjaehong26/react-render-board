# ADR-0046: 리스트 접기(sibling coalescing) — 같은 종류 형제 N개를 대표 하나 + "×N"으로

- 상태: 채택됨(레이아웃 안정성 라운드 1/3 — 다음: downfall barycenter, 공유 레인)
- 날짜: 2026-07-18

## 맥락 (Context)

렌더 트리에서 리스트(`items.map(...)`)는 100개 이상도 흔하다. 지금은 그 N개를 전부 노드로 그려 세 가지 문제가 있다:

1. **구조 불안정** — 리스트가 늘면 그 그룹 폭이 요동쳐 옆 그룹까지 밀린다. 이게 라이브 다이어그램의 최대 흔들림원이다.
2. **성능** — 노드 수 비례 비용(ADR-0017의 O(n) 부담).
3. **가독성** — 똑같은 박스 100개는 정보 가치가 없다.

사용자가 제안했다: "리스트 아이템은 노드 하나로만 표현하고 개수만 알려주면 구조 안정성이 오른다." 논의에서 이게 **downfall(barycenter) 레이아웃의 안정성 토대**임이 드러났다 — 리스트 폭 요동만 없애면 남는 구조 변화는 드문 이산 이벤트(모달/탭/라우트/데이터)뿐이라 barycenter를 안심하고 적용할 수 있다.

## 검토한 대안 (Options)

### 어느 레이어에서 접을까

- **데이터 레이어(serialize, RenderNode)** — 기각. `RenderNode`는 architecture.md가 "되돌리기 어려움"으로 고정한 스키마다. 여기서 노드를 지우면 id→Fiber 매핑·인터랙션·다른 소비자가 다 깨진다.
- **시각화 레이어(normalize 뒤 VisibleNode[])** — 채택. 데이터는 그대로 두고 "화면에 그릴 노드"만 접는다. 대표는 **실제 fiber id를 유지**해 클릭/하이라이트/props가 그대로 동작한다.

### 무엇을 "같은 종류"로 볼까

- (parentId, kind, group, displayName)이 같은 형제. 익명 노드는 제외. `COALESCE_MIN`(=5) 이상 모일 때만 접는다 — 그 미만은 의도적 소수 집합일 수 있어 둔다.

### 대표를 누구로

- **가장 작은 id.** 리스트가 재정렬돼도(React key 변경) fiber id는 안정적이라 대표가 안 바뀐다 → 라이브에서 대표 노드가 깜빡이지 않는다.

## 결정 (Decision)

**`coalesceListSiblings(VisibleNode[]) → VisibleNode[]`를 normalize 직후에 돌린다.** 같은 부모 밑 (kind,group,displayName)이 같은 형제가 `COALESCE_MIN` 이상이면, **가장 작은 id를 대표로 남기고 나머지 형제와 그 서브트리 전체를 목록에서 뺀 뒤**, 대표에 `coalescedCount = N`을 붙인다. `ComponentNode`가 이를 우측 상단 "×N" 배지로 그린다.

- `VisibleNode`에 `coalescedCount?: number` 추가(스키마 밖 프레젠테이션 필드).
- Canvas: `coalesceListSiblings(normalizeForCanvas(...))`.
- 대표의 서브트리는 유지("예시" 아이템), 나머지 아이템의 서브트리는 드롭 → 노드 수 급감.

## 근거 (Rationale)

- **안정성 토대.** 리스트가 100→150 늘어도 그래프는 대표 1개 그대로 → downfall barycenter의 연쇄 재배치 걱정이 크게 준다.
- **정보 손실 없음.** 리스트 아이템은 구조적으로 동일하니 "대표 하나 + ×N"으로 충분하다. 개별 차이(props)는 대표를 클릭해 본다.
- **데이터/인터랙션 불변.** 시각화 레이어에서만 접어 스키마·id→Fiber·역방향 인터랙션이 그대로다(대표는 실제 fiber). 접힌 아이템을 Alt+클릭하면 `resolveVisibleId`가 조상(리스트 컨테이너)으로 착지한다 — 완벽하진 않지만 안전한 폴백.
- **성능은 덤.** N개 노드 생성이 1개로 줄어 ADR-0017 부담이 준다.

## 결과 (Consequences)

- **바뀐 것**: 새 `coalesce.ts`, `normalize.ts`(`coalescedCount` 필드), `Canvas.tsx`(파이프라인 1줄), `toFlow.ts`(data 전달), `ComponentNode.tsx`+`flow.css`(배지). 데이터 레이어·인터랙션 스토어 불변.
- **검증**: `tsc` 클린, 유닛 테스트 8개 추가(임계값 미만 무접기 / 접기+개수 / 최소 id 대표 / 서브트리 드롭 / 그룹 다르면 무접기 / 익명 무접기 / 부모별 독립), 전체 통과. 실측(`?stressCount=30`) — StressLeaf 30개가 대표 2개("×15" 배지)로 접히는 것 확인, 콘솔 에러 0.
- **트레이드오프**: 같은 컴포넌트의 "의미적으로 다른" 인스턴스(예: 서로 다른 라벨의 Button 6개)도 displayName이 같으면 "×6"으로 접힌다 — 구조 뷰에선 타당하나(차이는 props에), 원치 않으면 나중에 "props 다르면 안 접기" 같은 정교화를 얹을 수 있다. 접힌 아이템은 검색/개별 클릭 대상이 아니게 된다(대표만).
- **되돌리기 쉬움**: 시각화 레이어 순수 함수 하나. 파이프라인에서 빼면 원상복구.
- **다음**: 이 안정성 토대 위에 (2) downfall barycenter(order-once) (3) 공유 컴포넌트 = 공유 레인 — ADR-0034 개정 라운드로 잇는다. 구조 지속성(자리 예약)은 [`../research/2026-07-18-structural-persistence-slot-reservation.md`](../research/2026-07-18-structural-persistence-slot-reservation.md)에 방향만 기록.
- **관련 문서**: 그룹핑 [ADR-0007](0007-grouping-hint-feasibility.md), 뷰포트 O(n) 제약 [ADR-0017](0017-viewport-based-partial-recompute.md), waterfall 레이아웃 [ADR-0034](0034-group-level-waterfall-layout.md).
