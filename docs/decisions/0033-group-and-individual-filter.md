# ADR-0033: 그룹+개별 동시 필터 — 검색을 "강조"에서 "숨김"으로 확장

- 상태: 채택됨
- 날짜: 2026-07-18

## 맥락 (Context)

ADR-0027이 검색 하이라이트+자동 이동을 구현하면서 UX 레이어 표에 "그룹+개별 동시 필터(도메인
통째로 숨기기)"를 별개 기능으로 남겨뒀다 — `research/2026-07-17-react-flow-ux-capabilities.md`
2절이 이미 이 둘을 구분했다: 하이라이트/디밍은 배열에서 제거하지 말고 `data.matched` 필드로,
그룹 단위로 완전히 숨기는 건 `hidden` 필드가 맞다는 게 조사 결론이었다.

ADR-0027/0031(검색+테마, 그룹접기/컨텍스트메뉴/스티키노트) 완료 뒤 사용자에게 다음 우선순위를
물었고, "그룹+개별 동시 필터"를 골랐다 — 검색/그룹접기와 같은 라운드에서 이미 검증된 패턴
(`shouldExpandGroup`을 통한 노드 생성 여부 제어)을 재사용해 작은 스코프로 끝낼 수 있다는
점이 선택 이유였다.

## 검토한 대안 (Options)

- **React Flow `hidden` 필드 사용** — 기각. 연구 문서가 이미 확인한 대로 부모(group) 노드에
  `hidden:true`를 설정해도 자식 노드는 자동으로 숨겨지지 않는다([issue #2179](https://github.com/wbkd/react-flow/issues/2179)) —
  구현하려면 부모 `hidden` 변경 시 자식들의 `hidden`도 직접 재귀 순회하며 세팅해야 한다.
- **`toFlow.ts`의 노드 생성 여부 자체를 제어(채택)** — ADR-0016/0017(뷰포트 기반 부분
  재계산, P1)이 이미 "이 그룹/노드를 flowNodes 배열에 넣을지 말지"를 결정하는 메커니즘을
  갖고 있다. `hidden` 필드로 사후에 숨기는 대신, 애초에 배열에 안 넣으면 React Flow의
  `hidden` 부모→자식 비전파 문제 자체가 발생하지 않는다 — 별도의 재귀 전파 로직이 필요
  없다.

## 결정 (Decision)

`toFlow.ts`에 `filterToMatches?: boolean` 옵션을 추가했다. `matchedIds`가 실제로 뭔가를
담고 있을 때만(검색어가 비어 있으면 무시 — 필터만 켜놓고 검색창이 비어 있다고 화면이
통째로 비면 안 된다) 두 지점에서 필터링한다:

1. **그룹 단위**: `g.nodeIds.some((id) => matchedIds.has(id))`가 거짓이면 그 그룹은 프레임
   자체를 만들지 않고 `continue`한다 — 기존에 "항상 프레임은 만든다"(ADR-0016 테스트 참고)는
   불변식을 이 옵션이 켜졌을 때만 예외로 둔다.
2. **개별 노드 단위**: 그룹이 살아남아도(매치가 하나라도 있어도) 그 안의 개별 컴포넌트 중
   매치 안 된 것은 만들지 않는다.

엣지는 기존 `expandedIds` 기반 필터(`expandedIds.has(n.id) && expandedIds.has(n.parentId)`)를
그대로 재사용한다 — 필터로 빠진 노드는 애초에 `expandedIds`에 안 들어가므로 그 노드로/에서
나가는 엣지도 자동으로 안 만들어진다. 새 엣지 로직이 필요 없었다.

Canvas.tsx에는 검색 입력 옆에 "매치만 표시" 체크박스를 추가했다 — 기존 "host 노드 표시"
체크박스와 같은 `.toolbar__checkbox` 클래스를 재사용해 새 CSS가 필요 없었다. 검색어와 독립된
별도 state(`filterToMatches`)로 둬서, 검색어를 지워도 필터 선택 자체는 유지된다(다음 검색 때
다시 체크할 필요 없음).

## 근거 (Rationale)

- P1(ADR-0017)이 이미 "무엇을 flowNodes 배열에 넣을지"를 통제하는 유일한 지점으로
  `shouldExpandGroup`을 확립해 둬서, 새 필터 기능이 그 패턴을 그대로 확장하는 것만으로
  끝났다 — 그룹 접기(ADR-0031)도 같은 지점(`shouldExpandGroup`)을 확장했고, 이번 필터는
  한 단계 더 안쪽(개별 노드 단위)까지 같은 원리를 적용한 것이다.
- `hidden` 필드의 부모→자식 비전파 문제를 연구 문서가 이미 실측 근거(GitHub 이슈)로
  확인해 둔 덕에, 그 함정을 피하는 설계를 처음부터 택할 수 있었다.

## 결과 (Consequences)

- **수정 파일**: `src/visualization/lib/toFlow.ts`(+test) — `filterToMatches` 옵션과 그룹/노드
  단위 스킵 로직, `src/visualization/Canvas.tsx` — `filterToMatches` state + 체크박스 UI,
  `scripts/verify-search-and-theme.mjs` — 필터 모드 시나리오 추가(그룹 프레임 수가 실제로
  줄고 체크 해제 시 복원됨을 확인).
- **검증**: `npm run test`(184개 통과) / `lint` / `build` / `build:lib` 전부 그린. 도킹 패널
  관련 6개 스크립트 + 확장된 `verify-search-and-theme.mjs` + `verify-ux-round3.mjs` 전부
  콘솔 에러 0건.
- **되돌리기 쉬움**: `RenderNode`/`RenderSnapshot` 스키마 밖의 `toFlow.ts` 옵션과 Canvas 로컬
  state로만 구현돼 기존 파이프라인에 영향이 없다.
- **UX 레이어 표 완결**: 이걸로 `research/2026-07-17-react-flow-ux-capabilities.md`가 조사한
  후보 전부(선행 조건 없는 4개 + "큰 작업"이던 그룹 접기 + 이번 필터)가 구현됐다. 남은 건
  명확한 선행 조건이 있는 코드로 점프(스키마 확장)와 JSDoc 툴팁(별도 리서치)뿐이다.
