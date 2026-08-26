# ADR-0049: 지도 모드에서도 상세 표시 토글

- 상태: 채택됨(semantic zoom의 "지도=영역만"에 예외 토글 추가, 집계선 관련 서술은 ADR-0090으로 대체)
- 날짜: 2026-07-18

## 맥락 (Context)

semantic zoom(ADR-0006/0017)은 줌아웃하면 지도 모드로 전환돼 그룹을 프레임만 남기고 내부 컴포넌트를 접는다 — 가독성(줌아웃 시 노드가 작아짐)과 성능(ADR-0017: 화면 밖 노드를 아예 안 만드는 게 대규모의 핵심)을 동시에 잡는 장치다. 그런데 사용자 피드백: **"축소했더니 보던 게 안 보여 불편하다."** 상세를 보다 맥락을 위해 줌아웃하면 그 상세가 통째로 사라진다.

## 검토한 대안 (Options)

- **그룹별 클릭으로 핀 고정** — 지도 모드에서 그룹을 클릭하면 그것만 펼침. 정밀하지만 클릭 안 한 건 여전히 사라져 "연속성" 불편을 완전히 못 없앤다.
- **전체 토글 "지도에서도 상세"** — 채택. 한 번 켜면 지도 모드에서도 화면에 걸치는 그룹은 내부를 펼친다. "줌아웃하면 사라진다"를 한 번에 해소. 성능은 **뷰포트 컬링을 그대로 유지**(ADR-0017)해 화면 밖 그룹은 여전히 안 그리므로, 비용이 화면 안 개수에 묶인다.

전체 토글이 사용자의 불편(연속성)에 더 직접적이고, 구현도 국소적이라 택했다. 그룹별 핀은 나중에 정밀 보완으로 얹을 수 있다.

## 결정 (Decision)

**툴바에 "지도에서도 상세" 체크박스(`wideDetail`)를 추가한다.** 켜지면 `Canvas`의 `shouldExpandGroup`에서 `isMapMode` 강제 접힘을 건너뛰고, 지도 모드에서도 `viewRect`(뷰포트 교차)로 화면 안 그룹만 펼친다. 세션 탐색 보조라 영속화하지 않는다.

- `if (isMapMode) return false;` → `if (isMapMode && !wideDetail) return false;`
- `viewRect` 계산 조건을 `!isMapMode` → `(!isMapMode || wideDetail)`로 확장(지도 모드에서도 뷰포트 컬링이 돌게).
- **CSS도 되돌려야 한다(빠졌던 부분).** `.zoom-far .component-node { opacity: 0 }`이 지도 모드에서 노드를 숨기므로, 위 로직으로 노드를 *만들어도* 안 보였다(초기 구현의 버그 — 실측을 DOM 개수로만 해서 놓침). 캔버스에 `wide-detail` 클래스를 붙이고 `.zoom-far.wide-detail .component-node/.react-flow__edge { opacity: 1 }`로 되살린다. 그룹이 실제로 펼쳐지므로 집계 엣지(edge-group-link)는 대신 숨겨 노드 엣지와 중복을 피한다.

## 근거 (Rationale)

- **뷰포트 컬링과 양립.** 지도 모드 강제 접힘만 예외로 두고 뷰포트 교차 판정은 그대로라, 화면 밖은 여전히 안 그린다 — ADR-0017의 O(n) 방어가 유지된다(성능 안전).
- **불편의 정확한 해소.** "줌아웃하면 사라진다"는 연속성 문제라, 한 번 켜면 줌아웃해도 유지되는 전체 토글이 맞다.
- **남는 한계는 근본적.** 아주 낮은 배율에선 컴포넌트 박스가 작아진다(월드 좌표). 이건 semantic zoom의 본질이라 토글로 없앨 수 없고, 적당한 배율에선 "넓게 + 상세"가 둘 다 된다.

## 후속 수정 (hover 혈통 dimming과의 상충)

wideDetail로 노드가 빽빽해지면, hover 혈통 점등(ADR-0044)이 마우스 아래 노드의 혈통 외 모든 노드를 0.18로 죽여 "다 페이드"로 보이는 문제가 나왔다("줌 로직 중첩" 아님 — 실측으로 stuck 아님을 확인: 상세 모드에서 빈 캔버스로 나가면 정상 클리어). wideDetail은 "넓게 다 보기"인데 hover-dimming은 "하나만 강조"라 목적이 상충한다. → **wideDetail이 켜져 있으면 hover 혈통 노드 dimming을 끈다**(`.canvas.wide-detail .component-node--lineage-off { opacity: 1 }`). 간선 혈통 강조(edge-lineage)는 유지해 경로는 여전히 도드라진다. 일반 상세 모드(wideDetail off)의 hover focus는 그대로.

## 결과 (Consequences)

- **바뀐 것**: `Canvas.tsx`(`wideDetail` 상태 + `shouldExpandGroup`/`viewRect` 조건 + useMemo 의존성 + 툴바 체크박스). 데이터/레이아웃 불변.
- **검증**: `tsc` 클린, 유닛 테스트 291개 통과. 실측 — 지도 모드(2%)에서 컴포넌트 노드 0개 → 토글 켜면 59개 등장, 콘솔 에러 0.
- **되돌리기 쉬움**: 조건 두 줄 + 체크박스. 끄면 기존 동작.
- **관련 문서**: semantic zoom [ADR-0006](0006-exp2-flow-prototype-ui-validation.md), 뷰포트 컬링 [ADR-0017](0017-viewport-based-partial-recompute.md), 지도 모드 LOD [ADR-0018](0018-map-mode-lod-and-camera-refit.md).
