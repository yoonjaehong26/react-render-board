# ADR-0060: corridor-local sticky 간선 트랙 (v3 Phase 3 — 층별 버스 바 스택으로 교차 감소)

- 상태: 채택됨(구현 — 층별 트랙 완료 / cross-layer·공유 컴포넌트는 유예)
- 날짜: 2026-07-18

## 맥락 (Context)

[ADR-0059](0059-edge-target-color-gradient-and-lane-spread.md)로 색(그라데이션)·선(실선)은 나아졌으나 사용자 실측: **"아직 겹치는 게 많다. 근데 워터풀 구조라 최적화가 더 쉬울 것."**

정확한 지적이다. 겹침의 핵심은 **같은 층의 여러 버스 바가 한 barY에 몰리는 것**이다 — 예: `ProductSection.tsx`의 `ShopProductCard×5`가 각자 `(PriceBlock/RatingStars/Button)`로 fan-out하는데, 5개 버스의 수평 바가 전부 프레임 바로 아래 같은 y에 겹쳐 뭉친다. [ADR-0059](0059-edge-target-color-gradient-and-lane-spread.md)의 전역 레인(±16)은 corridor-local 정렬이 아니라 이걸 못 푼다.

**tidy-tree 레이아웃(ADR-0058)이 이 문제를 쉽게 만든다**: 층이 깨끗한 가로 밴드(y=깊이)라, 인접 층 사이 간선은 하나의 잘 정의된 가로 거터를 지난다. 그래서 "트랙 배정"이 일반 2D 뒤엉킴이 아니라 **거터별 1D 순서 문제**로 쪼개진다.

## 결정 (Decision)

**거터별(=소스 그룹 프레임 y-층) sticky 트랙 배정.** `assignGutterTracks(sources)` 순수 함수(`edgeRouting.ts`):

1. 크로스-그룹 간선의 출발을 **소스 그룹 프레임 바닥 y(=거터 위치)별로 묶는다.** 같은 층 = 같은 거터 공유.
2. 각 층 안에서 **출발 중심 x 오름차순**으로 정렬(동률은 id로 결정적)해 **트랙 오프셋 = index × TRACK_GAP(11px)**, 상한 `MAX(44)`에서 클램프.
3. 이 오프셋을 `laneOf(source)`로 중앙 배선 pass(`routeCrossGroupBuses`)에 먹인다 → 각 버스의 **barY = 프레임바닥 + GUTTER(20) + 트랙오프셋**. 같은 층 버스들이 겹치지 않고 **층층이 스택**, 좌→우 정렬로 stub 교차 감소(metro-line/VLSI left-edge 휴리스틱).

- **오프셋은 아래(거터)로만** 키운다(0..44) — barY가 항상 프레임 바닥보다 아래라 **프레임 안으로 안 들어간다.** 거터를 넘치면(트랙이 다음 층에 닿으면) 버스가 A*로 **폴백해 관통 0 유지**(ADR-0054 안전장치 재사용).
- **sticky**: 층 y·소스 x는 레이아웃에서 안정(ADR-0058 깊이/순서 불변) → 결정적. 새 간선이 떠도 기존 트랙 순서를 안 흔든다(ADR-0008 순서 고정의 간선 판).

## 근거 (Rationale)

- **문제의 정확한 층위.** 겹침은 "같은 거터 안 여러 바"라, 전역 레인이 아니라 거터-로컬 트랙이 맞다. 워터풀이 거터를 1D로 만들어준 덕에 NP-hard 근사가 아니라 단순 정렬로 푼다("워터풀이라 더 쉬울 것"이라는 사용자 직관과 일치).
- **저위험·안정.** 순수 함수 + 유닛 테스트, 오프셋은 아래로만이라 프레임 침범 불가, 넘침은 기존 폴백이 흡수. 좌표 순수성이라 라이브 안정성 상속.
- **점진적.** 중앙 pass(ADR-0054)의 `laneOf` 훅을 그대로 쓴다 — 배선 알고리즘은 안 건드리고 트랙 y만 개선.

## 유예 (Deferred)

- **cross-layer 교차.** 층을 건너뛰는(≥2층) 간선·공유 컴포넌트는 여러 거터를 지나므로 한 거터 트랙만으론 안 풀린다. 다중 거터 트랙 전파는 후속.
- **공유 컴포넌트 레인**(다중 부모, ADR-0056/0058 후속) — 레이아웃 쪽과 함께.
- **수직 corridor 트랙.** 지금은 수평 바(barY)만 트랙화. 수직 트렁크/스텁이 같은 x-corridor에 몰리는 경우의 x-트랙은 후속(대개 소스·타깃 x가 이미 달라 덜 급함).

## 결과 (Consequences)

- **바뀐 것**: `edgeRouting.ts`(`assignGutterTracks` + `TrackSource`), `Canvas.tsx`(`edgeLanes`가 거터-로컬 트랙 계산). 배선 알고리즘·색·데이터·노드 좌표 불변.
- **검증**: 유닛 335개(신규 4: 층별 스택·층 독립·클램프·sticky 결정성), `verify:edge-routing` 실측 9/9 ortho·프레임 관통 0·콘솔 에러 0. 시각은 `npm run dev`(같은 층 버스 바가 층층이 분리).
- **되돌리기**: `edgeLanes`를 전역 레인으로. `TrackSource`/`assignGutterTracks` 제거. 순수 프레젠테이션.
- **관련 문서**: 중앙 pass·Phase 계획 [ADR-0054](0054-edge-routing-v3-coordination-design.md), 색/실선/레인 [ADR-0059](0059-edge-target-color-gradient-and-lane-spread.md), tidy-tree 층 배치(이 트랙을 쉽게 만든 토대) [ADR-0058](0058-tidy-tree-centered-group-layout.md), 순서 안정성 [ADR-0008](0008-live-mvp-integration.md).
