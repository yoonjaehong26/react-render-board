# ADR-0093: 밀집 projection과 국소 host 상세

- 상태: 채택됨(구현)
- 날짜: 2026-08-27

## 맥락

ADR-0089의 strict waterfall은 실제 부모→자식 관계를 가장 읽기 쉽게 만들지만, 넓은
서브트리가 많은 대규모 화면에서는 전체 폭이 커진다. 반대로 raw host(`div`/`span` 등)를
모두 같은 캔버스 트리에 넣으면 DOM 구현 세부가 파일·컴포넌트 구조보다 더 큰 공간을 차지하고
다른 그룹과 시각적으로 겹친다.

두 요구는 서로 다른 탐색 목적이다. 전체 구조를 훑는 밀집 개요와 실제 관계를 추적하는
waterfall을 하나의 자동 줌 규칙으로 섞으면, ADR-0090이 제거한 "줌에 따라 관계 의미가
달라지는" 문제를 다시 만든다.

## 결정

1. 원본 `RenderNode`와 기본 strict waterfall은 변경하지 않는다. `compactMode`는 별도의
   **표현 projection**으로 `toFlow`에만 들어간다.
2. 밀집 모드는 기본 strict waterfall의 그룹 프레임·부모→자식 방향·실제 컴포넌트 좌표 규칙을
   유지한다. 전역 DOM grid나 파일 관계 그래프로 재배치하지 않으며, 줌도 이 모드를 자동으로
   켜거나 끄지 않는다.
3. 루트 아래 첫 번째 컴포넌트 층은 개요로 남긴다. 그 아래 부모 **Fiber 인스턴스**의 직접 자식
   가지(같은 파일/다른 파일 모두)를 후보로 만들고, 파일 프레임별 가로 폭 예산을 넘긴 경우에는
   **깊고 폭 절감 효과가 큰 후보부터** Summary 카드로 접는다. 자식 하나인 체인은 항상 보존한다.
   자식 둘도 작은 분기라면 보존하지만, 하위가 넓거나 깊으면 후보가 된다. `DemoApp` 파일 안의
   많은 직접 자식이 가로 폭을 만드는 경우도 대상이다. 부모 source에서 카드까지는 기존 부모→자식
   위치에 한 줄로 연결하고, 카드에는 직접 자식 수·숨긴 하위 컴포넌트 수를 표시한다.
4. Summary 카드의 셰브런을 누르면 해당 **부모 source의 fan-out**만 이번 세션에서 strict waterfall로
   다시 계산한다. 이때 source 카드 아래에는 `자식 N개 요약` 제어를 남겨 같은 위치에서 다시 접을 수
   있다. 검색·화면 Alt+클릭은 기존 구조 탐색 규칙을 유지하며, 캔버스의 Alt 제스처는 쓰지 않는다(Alt는
   이미 실제 화면 요소 선택 의미).
5. host는 구조 배치에 절대 참여시키지 않는다. `host 상세` 토글은 선택된 컴포넌트의 가장 가까운
   host 자손을 `tag ×N` 국소 popover로만 보여 준다. 다음 composite 아래의 host는 그 composite의
   소유이므로 부모 host 상세에 중복하지 않는다.

## 결과

- 기본 모드의 수직 관계·간선 규칙·가로 폭은 그대로 보존된다.
- 밀집 모드는 개별 `자식 N개` 임계값이 아니라 파일별 폭 예산으로 동작한다. 한 파일 안의 넓은
  직접 자식 행도 카드로 바꾸되, 첫 구조 층과 단일 자식 체인은 남긴다. 펼침과 재요약을 같은 source
  위치에서 왕복할 수 있다.
- host를 켜도 raw host 노드 수백 개가 캔버스와 레이아웃 엔진에 추가되지 않아 사진과 같은
  밀집·겹침이 생기지 않는다.

## 검증

- layout 순수 검증: 같은 파일의 넓은 직접 자식 행과 cross-file fan-out이 summary로 전환·작은
  2자식 분기 보존·넓은 2자식 분기 전환·요약 폭 감소·국소 strict 복원
- host summary 순수 함수: nearest-composite 소유·동일 tag 집계·중복 방지
- `toFlow`/Canvas: 기본 모드 산출 불변, summary 부모 연결·국소 펼침과 선택 host popover
- typecheck·vitest·Playwright 화면 검증

## 관련 문서

- 기본 strict waterfall: [ADR-0089](0089-strict-source-subtree-waterfall.md)
- 줌에 따른 관계 교체 금지: [ADR-0090](0090-stable-parent-child-edges-across-zoom.md)
- 기존 그룹 접기/펼치기: [ADR-0031](0031-collapse-context-menu-sticky-notes.md)
