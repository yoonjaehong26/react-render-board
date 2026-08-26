# ADR-0087: 제약 기반 압축 waterfall — 수직 간선 우선, 폭 전파 금지

- 상태: 채택됨(구현)
- 날짜: 2026-08-26
- ADR-0086 보완: 상위 source 슬롯으로 자식 파일 폭을 전파한 부분을 대체

## 맥락

ADR-0086의 서브트리 envelope/부모 슬롯 예약은 서로 다른 부모 가지를 확실히 벌려 간선 겹침을
줄였지만, 넓은 자식 파일의 폭이 조상 파일의 모든 sibling source까지 전파됐다. `DemoApp` 안의
`AppShell`, `FarDialogDemo`, `Storefront`처럼 실제로는 독립적인 부모 컴포넌트 사이에도 큰 빈 공간이
생겼다. 안전하지만 캔버스가 지나치게 가로로 넓어지고, 읽는 시선이 부모→자식 수직 흐름보다 빈
공간을 먼저 보게 된다.

문제의 충돌은 대개 **같은 자식 깊이 밴드의 파일 프레임** 사이에만 있다. 상위 부모 컴포넌트가
자식 파일 전체 폭을 미리 들고 있을 필요는 없다.

## 결정

파일 그룹의 메인 waterfall x 배치를 밴드별 제약 압축으로 둔다.

1. 자식 그룹의 희망 중심은 실제 부모 컴포넌트 render-anchor x다. 프레임이 겹치지 않으면 이
   희망 위치를 그대로 사용하므로 간선은 수직이다.
2. 같은 밴드에서 x 순서가 정해진 프레임만 다음 최소 간격을 만족시킨다.

   ```text
   center[i + 1] - center[i] >= (width[i] + width[i + 1]) / 2 + GROUP_H_GAP
   ```

3. 희망 frame 범위가 겹친 연속 항목만 하나의 block으로 묶고, block을 그 anchor들의 평균 중심에
   최소 폭으로 둔다. 분리된 block은 자신의 anchor에 그대로 남는다.
4. 그룹 내부 부모 컴포넌트는 기본 tidy-tree 간격을 유지한다. 자식 파일 frame 폭을 상위 leaf 슬롯에
   전파하지 않는다.

이는 완전한 일반 QP solver 대신, 이 시각화에 필요한 1차원 순서·최소간격 제약을 결정적으로 푸는
block projection이다. live commit에서 위치가 불필요하게 흔들리지 않는다는 기존 안정성 계약도 유지한다.

## 결과

- `AppShell`과 `FarDialogDemo`처럼 서로 충돌하지 않는 상위 부모는 다시 조밀하게 배치된다.
- 넓은 `Storefront` 자식 파일들처럼 실제로 겹치는 프레임만 해당 자식 층에서 최소한으로 밀린다.
- 가능한 관계선은 부모 source에서 자식 group까지 수직으로 유지하고, 불가능한 경우에만 한 번의
  전용 rail 수평 구간이 생긴다.
- ADR-0086의 **실제 부모 컴포넌트에서 구조 관계선을 출발하고 source별 버스를 분리한다**는 규칙은
  유지한다. 대체되는 것은 상위 슬롯/서브트리 폭의 과도한 전파뿐이다.

## 검증

- `layout.test.ts`: 넓은 자식 파일이 상위 부모 밴드를 밀지 않고, 같은 자식 밴드의 프레임만
  비중첩으로 배치되는지 확인한다.
- `toFlow.test.ts`: 실제 source anchor를 유지하는지 확인한다.
- 브라우저 구조/상세 간선 회귀 검증을 실행한다.

## 관련 문서

- 서브트리/실제 source 관계선: [ADR-0086](0086-subtree-envelope-waterfall-routing.md)
- render-anchor 순서: [ADR-0085](0085-render-anchor-waterfall-layout.md)
- 파일 관계 semantic zoom: [ADR-0084](0084-group-relation-semantic-zoom.md)
