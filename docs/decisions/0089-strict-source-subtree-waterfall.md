# ADR-0089: Strict source–subtree waterfall

- 상태: 채택됨(구현)
- 날짜: 2026-08-27
- ADR-0088 보완: 직접 자식 frame 폭이 아니라 실제 source→최종 자식 서브트리 span을 예약

## 맥락

ADR-0088은 부모 leaf 컴포넌트가 직접 자식 파일의 base frame 폭을 예약해 일반적인 간선 꺾임을
줄였다. 그러나 테스트 프로젝트처럼 1depth 자식 파일과 그 2depth 하위 파일이 모두 넓으면, 같은
깊이 프레임 충돌을 해결하는 과정에서 자식 그룹이 source x에서 다시 옆으로 밀린다. 즉 부모 간격을
넓혀도 **최종 배치된 자식 서브트리 폭**을 반영하지 않으면 일직선 관계를 보장할 수 없다.

사용자는 Alt+클릭/검색으로 국소 구조로 바로 이동할 수 있으므로, 전체 그래프를 한 화면 폭에 넣는
것보다 parent→child 연결을 읽는 것을 우선한다.

## 결정

평면 파일 관계 레이아웃을 strict waterfall로 둔다.

1. 공유 레인이 아닌 대표 부모 트리에서 각 그룹의 subtree span을 아래에서 위로 계산한다.

   ```text
   span(group) = max(frameWidth(group), Σ span(primaryChild) + gap)
   ```

2. 실제 **leaf source 컴포넌트**가 렌더하는 primary child group들의 subtree span 합을 그 source의
   가로 슬롯으로 예약한다. 이 계산은 frame 폭과 slot 폭이 서로 영향을 주므로 결정적으로 4회
   수렴한다.
3. 부모 그룹을 배치한 뒤, child group의 중심은 그 source 슬롯 안에 배정된 child subtree span의
   중심에 둔다. source가 child 하나만 렌더하면 source center와 child frame center가 정확히 같다.
4. source가 여러 child를 렌더할 때만 source 중앙의 전용 rail에서 fan-out한다. 서로 다른 source의
   슬롯/서브트리는 겹치지 않는다.
5. ADR-0087의 main-band compact projection은 strict main tree에는 적용하지 않는다. 공유/다중 부모
   그룹은 기존 공유 레인 예외를 유지한다.

## 결과

- 가로 폭은 커질 수 있고, 그것을 의도된 비용으로 받아들인다. 깊은 넓은 서브트리가 실제로 필요한
  공간을 조상 source까지 예약하므로 이후 프레임 충돌 때문에 수직 관계가 우측으로 밀리지 않는다.
- 단일 parent→child 관계는 frame 중심 기준으로 수직이다. 여러 child 관계의 꺾임은 같은 source의
  명시적 fan-out rail에서만 생긴다.
- non-leaf source(같은 파일 안 자식도 가진 채 cross-group 자식을 렌더하는 컴포넌트)는 현재
  tidy-tree 중심 fallback을 유지한다. 이 드문 패턴까지 strict 슬롯으로 확장하는 것은 별도 작업이다.

## 검증

- `layout.test.ts`: 넓은 직접 자식에 따라 source 간격이 넓어지는지, 단일 child source와 child
  frame 중심이 정확히 정렬되는지, 손자 폭 예약 회귀를 확인한다.
- `toFlow.test.ts`: source anchor 관계선 계약을 확인한다.
- 구조/상세 Playwright 검증으로 semantic zoom과 프레임 회피 회귀를 확인한다.

## 관련 문서

- 직접 자식 읽기 우선 기본값: [ADR-0088](0088-direct-child-envelope-readable-default.md)
- 밴드별 압축 정책: [ADR-0087](0087-constrained-waterfall-compaction.md)
- 공유 UI 레인: [ADR-0061](0061-shared-ui-lane.md)
