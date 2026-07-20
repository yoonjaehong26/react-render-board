# ADR-0035: 시각 언어 1라운드 구현 — 라우트 6각형 + 손그림 다크/강조/크롬/워드마크

- 상태: 채택됨(구현). ~~포탈 표식·경계 구별선은 실측 후 다음 라운드로 명시적 보류.~~ **→ 아래 "후속 수정 3"에서 스키마 변경 없이 구현 완료**(`roleMarkers.ts`/`boundaryFrames.ts`/`BoundaryFrame.tsx`, 이름표 붙은 프레임 + 접힌 그룹 점선 링). 워드마크 OFL 웹폰트 에셋만 미완(시스템 폴백).
- 날짜: 2026-07-18

## 맥락 (Context)

[ADR-0028](0028-shape-vocabulary-for-node-roles.md)(도형 어휘)와 [ADR-0030](0030-excalidraw-hand-drawn-visual-identity.md)(손그림 시각 정체성)이 방향만 정하고 구현을 다음 라운드로 미뤄 둔 것을, 두 ADR이 제시한 **비용 그라디언트 순서대로** 코드로 옮긴 라운드다. 두 ADR 모두 "전부 프레젠테이션이라 되돌리기 쉬움"으로 분류돼 있어 데이터 스키마(`RenderNode`)는 건드리지 않는 것을 전제로 했다.

## 결정 (Decision) — 이번 라운드에 구현한 것

**1. 라우트 6각형 (ADR-0028 1순위, 스키마 변경 없음).**
- `toFlow.ts`의 `isRouteGroup(group)` = 그룹 경로(그 노드의 `groupHint`가 resolve된 값, `groups.ts`)가 `page.(tsx|jsx|ts|js)`로 끝나는지. Next.js App Router의 라우트 진입 파일 관례를 그대로 판별한다.
- `isRouteEntry` = `kind==='composite'` **and** `isRouteGroup(group)` **and** (부모 없음 **or** 부모가 다른 그룹). 즉 그 route 그룹으로 **처음 들어오는 경계 노드 하나**만 6각형이 되고, 같은 `page.tsx` 그룹 안의 인라인 자식은 사각형으로 남는다 — "역할(진입점)"의 의미를 살리면서 6각형 남발을 막는다. host 노드는 역할이 아니므로 제외.
- 이 파생은 순수 시각화 레이어에서 이뤄진다(`ComponentNodeData.isRouteEntry`). `RenderNode` 무변경.
- 도형 렌더: `roughStyle.ts`가 rough 6각형 정적 이미지를 만들고, `flow.css`의 `.component-node--route { clip-path: polygon(...) }`가 배경(팔레트 틴트)까지 6각형으로 잘라 rough 선과 형태를 맞춘다. clip-path의 x%와 `roughStyle.HEX_CUT_RATIO`(0.18)는 반드시 함께 바꾼다.

**2. 손그림 나머지 (ADR-0030 다음 라운드 대상 4건).**
- **(a) 다크 대응 테두리** — `roughStyle.ts`를 정적 이미지 2장 → **6장**(라이트/다크 × composite/host/route)으로 늘렸다. 다크 인디고 `#818cf8`(ADR-0027/0030 검증값) 재사용. 여전히 모듈 로드 시 유한 횟수만 계산 — 노드 수 비례 비용 0(ADR-0017 원칙 유지). 인라인 `background-image`가 CSS 다크 스코프보다 우선하므로 `colorMode`를 `toFlow` → `ComponentNodeData`로 내려 노드가 라이트/다크 이미지를 직접 고른다.
- **(b) 강조 상태 마커·햇칭** — 검색 매치=햇칭(녹색) 채움, 픽/역방향 착지=마커(solid 인디고) 채움을 테두리 아래 `background-image` 레이어로 겹친다("형광펜으로 짚은 순간"). 각각 정적 이미지 1장(O(1)). 기존 `--matched` outline / `--highlighted` pulse는 위치/애니메이션 신호로 그대로 두고 그 위에 질감을 더했다.
- **(c) 볼펜 세기 크롬** — `roughStyle.CHROME_BORDER`(roughness 0.2, 라이트/다크 2장)를 `BoardOverlay`의 플로팅 버튼(호스트 앱 위 O(1) 크롬)에 `background-image`로 얹고 `.rrb-rough-chrome`로 실선 border를 대체한다. 크기 제각각이라 기준 크기 1장을 `background-size:100% 100%`로 늘리되, roughness가 낮아 뭉개지지 않는다.
- **(d) "render-board" 워드마크** — 플로팅 버튼의 브랜드 토큰을 `.rrb-wordmark`로 감싸 손글씨 폰트 스택(`--rrb-handwriting`)을 적용했다. 다이어그램 라벨은 모노스페이스 유지(ADR-0030 축1).

## 근거 (Rationale)

- **스키마 무변경 원칙 준수.** 라우트/다크/강조/크롬 전부 시각화 레이어 파생 또는 CSS/정적 이미지라, architecture.md가 "되돌리기 어려운 결정"으로 고정한 `RenderNode`를 건드리지 않는다.
- **O(1) 정적 이미지 원칙 유지.** rough 계산은 (변형 개수)만큼만 모듈 로드 시 실행되고 노드 수와 무관하다 — ADR-0017의 "개수 비례 비용" 리스크를 원천 회피. 크롬도 노드 수 무관 레이어(ADR-0030 성능 분석)라 같은 방식.
- **6각형은 "진입 경계 노드만".** 그룹 전체가 아니라 경계 노드 하나만 표식해 preattentive 예산(ADR-0028)을 지키고 도형이 노이즈가 되지 않게 한다.

## 실측으로 확정한 것 / 보류한 것

> **갱신:** 아래 "포탈 표식 — 보류"·"경계 구별선 — 보류" 두 항목은 이 라운드 시점의 결론이며, **이후 "후속 수정 3"에서 실측 결과 스키마 변경 없이 구현 가능함이 확인돼 둘 다 구현됐다.** 아래는 당시 판단 기록으로 남긴다.

- **포탈 표식 — 실측 후 보류.** bippy `isHostFiber`(tag 5/26/27)·`isCompositeFiber`(tag 0/1/11/14/15) 둘 다 **HostPortal(tag 4)을 잡지 않음**을 bippy 소스로 실측 확인했다 → 포탈 fiber는 현재 노드가 되지 않고 자식이 논리적 부모에 재연결된다(ADR-0009가 검증한 "논리적 부모 아래 배치" 동작의 근거). 따라서 포탈에 표식을 주려면 `serialize.ts`의 `classify`/스키마 변경이 선행돼야 한다(ADR-0028 결과의 예측대로) — 스키마를 건드리는 유일한 항목이라, 파생만으로 끝나는 이번 라운드에서 분리해 다음 라운드로 넘긴다. **실측 없이 단정하지 않는다**(CLAUDE.md) 원칙에 따라 여기까지가 이번 라운드 결론이다.
- **경계(Suspense/Lazy/ErrorBoundary) 구별선 — 보류.** ADR-0028이 "가장 비쌈, `classify` 확장 선행"으로 분류한 대로, 포탈과 함께 데이터 레이어 변경이 필요한 다음 라운드 묶음으로 남긴다.
- **워드마크 OFL 웹폰트 에셋 — 미완(폴백만).** ADR-0030이 지목한 Excalifont 등 OFL woff2를 오프라인 환경에서 확보하지 못했고 `experiments/Virgil.woff2`는 검증용 사본이라 재사용 금지(ADR-0030). 지금은 `--rrb-handwriting`이 시스템 손글씨 계열(Comic Sans MS/Segoe Print/Bradley Hand/cursive)로 폴백한다 — 워드마크 마크업·폰트 배선은 끝났고, self-host `@font-face` 한 줄로 정식 에셋이 스택 맨 앞에 들어오는 상태다. 유일한 잔여 에셋 작업.
- **그룹 프레임 rough — 여전히 유보.** ADR-0030 축3대로 프로파일링 전까지 손대지 않는다.

## 결과 (Consequences)

- **테스트:** `roughStyle.test.ts`(신규, 이미지 조합/라우트·다크 구분/O(1) 참조 안정성), `toFlow.test.ts`(`isRouteGroup`·`isRouteEntry` 파생·colorMode 전달), `ComponentNode.test.tsx`(route 클래스·라이트/다크/강조 background-image 레이어) 추가·갱신. `npm run test`(전체 235개) / `lint` / `build` / `build:lib` 그린.
- **회귀 검증:** `verify.mjs`·`verify-search-and-theme.mjs`·`verify-dom-interaction.mjs` 전부 콘솔 에러 0으로 통과 — 워드마크를 `<span>`으로 감쌌지만 버튼 접근성 이름(`render-board 닫기` 등)이 유지돼 기존 인터랙션 스크립트가 그대로 동작함을 실측 확인. 라이브로 손그림 테두리·볼펜 크롬·워드마크 렌더도 직접 관찰.
- **데모 한계(정직하게 기록):** Vite 데모 fixture엔 `page.tsx` 그룹이 없어(Next.js App Router가 아님) 6각형이 실행 화면에 나타나지 않는다 — 파생 로직은 결정론적이라 유닛 테스트로 커버했다. 실제로 보려면 Next.js App Router 앱(또는 `app/.../page.tsx` 경로 fixture)이 필요하다.
- **소유 경계:** `flow.css`는 세션2(props)와 공유라 명확히 라벨링된 "시각 정체성" 섹션에만 추가했다. `Canvas.tsx`엔 `colorMode`를 `toFlow` 옵션/의존성에 더한 라벨된 추가만 했다(세션2의 afterglow 변경과 병행 병합 확인).
- **관련:** [ADR-0028](0028-shape-vocabulary-for-node-roles.md), [ADR-0030](0030-excalidraw-hand-drawn-visual-identity.md), [ADR-0017](0017-viewport-based-partial-recompute.md)(O(1) 원칙), [ADR-0027](0027-search-and-theme-ux-round.md)(다크 팔레트).

## 후속 수정 (사용자 피드백 반영)

첫 구현을 실행 화면에서 확인한 사용자가 "전체적으로 손그림 느낌이 크게 안 든다" + "라우트 6각형이 하나도 안 보인다"고 피드백했다. 실측해 보니 두 지적 모두 정확했다:

- **손그림 세기 부족** — 노드 rough를 절제해서(roughness 0.8/bowing 0.6) 160×48 박스에선 흔들림이 깔끔한 사각형과 사실상 구분되지 않았다. 노드를 **roughness 1.3/bowing 1.6/strokeWidth 1.8**로 올려 "손그림으로 읽히게" 했다.
- **그룹 프레임이 지배적 시각 요소** — 화면에서 가장 큰 선은 그룹 프레임인데 이게 깔끔한 CSS 대시라 전체 인상이 "깔끔한 다이어그램"으로 남았다. ADR-0030 축3가 "프로파일링 전 유보"한 그룹 프레임 rough를, **펼쳐진(상세 모드) 그룹에 한해** 적용하기로 유보를 풀었다. 성능 리스크는 (a) 크기 4px 버킷 메모이즈(`groupFrameImage`, 같은 크기 프레임은 rough 계산 재사용) + (b) 접힌/지도 모드/pending 프레임은 그대로 CSS 대시(지도에서 프레임 수백 개여도 rough 안 그림)로 억제했다. 프레임 크기·colorMode를 `GroupNodeData`로 내려 GroupNode가 background-image로 얹는다.
- **6각형이 데모에서 안 보이던 이유** — Vite 데모엔 `page.tsx` 그룹이 없어 트리거될 소스가 없었다(원 보고에 기록한 한계). Next.js App Router를 흉내낸 **fixture 추가**(`src/fixtures/domains/routes/app/dashboard/page.tsx` → `RouteHome`)로 `page.tsx` 그룹을 만들어, 그 진입 노드(RouteHome)가 실제로 6각형으로 그려짐을 실행 화면에서 확인했다.

**재검증:** 유닛 테스트에 `groupFrameImage`(메모이즈/크기·색 구분) 추가. `npm run test` 전체 248개 그린, `build`/`build:lib` 그린. 라이브(상세 모드 108%)에서 라우트 6각형 1개 + 손그림 프레임 5개 렌더 + 노드/프레임 손그림 테두리를 스크린샷으로 확인. 이 후속 수정은 데이터 스키마·레이아웃 불변식과 무관한 프레젠테이션이라 여전히 되돌리기 쉬운 영역이다.

## 후속 수정 2 (사용자 피드백: 툴바 손그림 + 글로우 대체)

첫 후속 수정을 다시 본 사용자가 "위 UI(툴바)도 손그림 느낌으로" + "글로우 효과가 너무 구리다, 다른 표현으로"라고 요청했다.

- **툴바 손그림화** — 상단 툴바 버튼/검색박스가 여전히 깔끔한 CSS 실선이라 손그림 캔버스와 이질적이었다. 볼펜 세기 rough 테두리(`CHROME_BORDER`)를 툴바 버튼(`.toolbar button`)·검색박스에 얹어 통일했다. **shared `Canvas.tsx`의 툴바 JSX는 안 건드리는** 방식으로 했다: `BoardOverlay`가 `CHROME_BORDER`/`HIGHLIGHT_RING` data URI를 `.board-panel`의 CSS 변수(`--rrb-chrome-border-light/dark`, `--rrb-highlight-ring-*`)로 내려주고, `flow.css`가 `.board-panel .toolbar button` 선택자로 참조한다 — 세션2가 추가한 버튼(잔상/일시정지)도 같은 선택자로 자동으로 손그림이 된다. 버튼 각자의 배경 색은 유지하고 테두리만 통일.
- **글로우 → 손그림 강조 링** — 역방향 착지 강조가 네온 `box-shadow` 펄스 글로우라 손그림 정체성과 정면으로 어긋났다. `roughStyle.HIGHLIGHT_RING`(굵고 흔들림 큰 rough 사각형, 라이트 `#4f46e5`/다크 `#a5b4fc`)을 `.component-node--highlighted::after`로 노드보다 살짝 크게(`inset:-4px`) 얹어 "마커로 한 번 동그라미 친" 표현으로 바꿨다. 애니메이션은 `opacity`만 은은하게 펄스한다 — **`transform`은 React Flow가 노드 위치에 쓰므로 절대 건드리지 않고**(건드리면 노드가 제자리를 벗어난다), blur 글로우도 안 쓴다. 기존 마커 채움(`ROUGH_FILL_HIGHLIGHTED`)은 그대로 둬 링+채움이 함께 강조한다.

**재검증(후속 2):** `build`/`build:lib`/전체 248 테스트 그린. 라이브에서 툴바 버튼/검색박스 rough 테두리 + Alt+클릭 역방향 착지 노드의 손그림 링(글로우 제거)을 스크린샷으로 확인. `verify-search-and-theme.mjs` 콘솔 에러 0으로 통과, `verify-dom-interaction.mjs`의 노드 강조 단계(강조 노드 수 1, DOM 하이라이트 박스)도 통과 — 즉 링 교체가 강조 클래스/동작을 안 깨뜨렸다.

> **동시 세션 충돌 메모:** `verify-dom-interaction.mjs`는 라인 151(픽 버튼 클릭)에서 타임아웃한다. ADR-0037 세션이 픽 FAB의 접근성 이름을 `🎯 요소 선택` → `요소 선택`으로 바꿨는데 이 스크립트를 갱신하지 않아서다(내 변경과 무관 — 격리 실측으로 FAB 자체는 정상 클릭됨을 확인). ADR-0037 소유라 여기서 고치지 않는다.

## 후속 수정 3 (포탈·경계 구별선 구현 — ADR-0028의 남은 도형 어휘)

ADR-0028이 데이터 레이어 변경 선행을 이유로 미뤄뒀던 **포탈 표식 + 경계(Suspense/에러 바운더리) 구별선**을 실측 후 구현했다.

**실측 결론(핵심): 스키마 변경 없이 된다.** 데모 fiber 트리를 직접 순회해 확인했다 — 포탈(HostPortal tag 4)·Suspense(tag 13) fiber는 노드로 안 만들어지고 버려지지만 **원본 fiber 트리엔 그대로 남아 있어**, 노드의 fiber에서 `.return`을 조금 올라가면 그 경계를 만난다. 에러 바운더리는 class라 이미 노드이고 공개 라이프사이클(`componentDidCatch`/`getDerivedStateFromError`)로 감지된다. 즉 셋 다 **`fibersById` 사이드채널(ADR-0026)만으로 파생**할 수 있어, `RenderNode`(architecture.md가 "되돌리기 어려운 결정"으로 고정)를 안 건드린다 — 검색/다크모드/props와 같은 "사이드채널 파생 = 되돌리기 쉬운 프레젠테이션" 부류다. ADR-0028이 걱정한 난이도가 실측으로 한 단계 내려갔다.

**표현 방식 — 아이콘 뱃지에서 "이름표 붙은 프레임"으로(사용자 결정).** 첫 구현은 노드에 아이콘 뱃지(⧉/⏳/🛡) + 색 외곽선을 붙였는데, 사용자가 "아이콘은 범례를 외워야 해서 직관적이지 않다, 더 쉽게"라고 지적했다. 레퍼런스를 보면 React DevTools는 아이콘을 안 쓰고 특수 컴포넌트를 **이름(Suspense 등) 그대로** 보여주고, 다이어그램 툴은 **이름표 붙은 프레임**으로 영역을 두른다 — "이 박스 안은 전부 이 경계 아래"라는 멘탈 모델과 일치한다. 개발자 도구엔 아이콘보다 "Suspense / Error boundary"라는 **단어**가 더 직관적이라, 뱃지를 걷어내고 경계가 감싸는 노드들을 이름표 붙은 프레임으로 두르는 방식으로 바꿨다.

**구현:**
- `roleMarkers.ts` `deriveBoundaryMemberships(anyFiber)` — 임의 노드에서 루트까지 올라간 뒤 원본 fiber 트리를 1회 스택 순회(재귀 아님, 깊은 트리 안전)하며 "경계 스택"을 들고 내려가, 각 kept 노드의 **가장 안쪽 경계 소속**(kind + 안정 boundaryId=getFiberId)을 구한다. 노드마다 `.return`을 매번 올라가는 것보다 싸다(트리 전체 O(fiber 수) 1회). RenderNode 스키마 무관.
- `boundaryFrames.ts` `buildBoundaryFrames(flowNodes, memberships)` — 같은 (그룹, 경계 인스턴스)에 속한 렌더 노드들의 바운딩 박스에 프레임 노드(type:'boundary')를 하나씩 만든다(여백+이름표 공간). `insertBoundaryFrames`가 각 그룹 프레임 바로 뒤(그 그룹의 컴포넌트 노드 앞)에 끼워 넣어 **z-순서**(그룹 프레임 위·컴포넌트 노드 아래)를 배열 순서로 보장한다.
- `Canvas`가 커밋마다(뷰포트 변화엔 재계산 안 하도록 snapshot에만 의존하는 별도 useMemo) 소속을 파생하고, `BoundaryFrame` 컴포넌트가 점선 박스 + 이름표(Portal/Suspense/Error boundary, teal/violet/rose)를 그린다. pointer-events:none으로 멤버 클릭을 안 가로챈다.
- 노드를 새로 "되살리지" 않아 노드 수는 안 늘고, 경계가 여러 그룹에 걸치면 그룹마다 프레임 하나(각각 이름표)로 단순화했다.

**검증:** 유닛 테스트 `roleMarkers.test.ts`(경계 소속 파생 — 형제 같은 인스턴스 묶기·가장 안쪽 경계 우선·에러바운더리 자기 포함·배관 제외) + `boundaryFrames.test.ts`(그룹·경계별 바운딩/여백/이름표 공간, z-순서 삽입) + `toFlow`/`ComponentNode`(뱃지 제거 반영). 라이브에서 데모의 모달(portal)·보고서(Suspense/lazy)를 켜고 검색으로 이동해 이름표 붙은 프레임(예: ReportRow 두 개를 두른 violet "Suspense" 프레임)이 z-순서대로(멤버 노드 뒤에) 그려지고 이름표가 그룹 라벨과 안 겹침을 스크린샷으로 확인.

**이름표 겹침 수정 + wideview 그룹 링(사용자 피드백).** ① 경계 프레임이 그룹을 거의 꽉 채울 때 이름표가 그룹 라벨과 겹쳐, 이름표를 프레임 안쪽 상단(그룹은 첫 자식이 헤더 아래 56px에서 시작 → 그 빈 띠)에 넣어 세로로 분리했다(`boundaryFrames.TOP_INSET`). ② 사용자가 "이 셋은 다 일시적 UI(모달 열림/Suspense 폴백/에러 캐치)라 wideview에서도 강하게 보여줄 근거가 된다"고 지적 — ADR-0028의 "도형=상세 모드 채널" 원칙의 정당한 예외로 받아들여, **지도 모드에서도 보이는 그룹 링**을 추가했다. `computeGroupBoundaryKinds`가 각 그룹이 품은 경계 종류를 집계하고(`GroupNodeData.boundaryKinds`), `GroupNode`가 그룹 프레임 바깥에 경계 색 **동심 링**(box-shadow spread, 종류마다 한 겹)을 그린다. 링 두께는 라벨과 같은 counterScale을 곱해 화면 기준 일정하게 유지하되(안 그러면 캔버스 축소에 눌려 사라짐), 극단적 줌아웃에서 이웃 그룹과 뭉치지 않게 배율 상한(RING_MAX_SCALE=8)을 뒀다. → 상세 모드: 정밀 이름표 프레임 / 지도 모드: 그룹 색 링 = semantic zoom LOD.

③ **점선 통일 + 접힌 그룹 한정(사용자 피드백).** 처음엔 그룹 링을 솔리드 box-shadow 동심 링으로 만들었는데, 사용자가 "안쪽 프레임(점선)과 외곽 링(솔리드) 디자인이 다르다, 둘 다 점선이 합리적"이라고 지적했다. box-shadow는 점선이 안 돼 **점선 outline**(한 겹)으로 바꾸고, 여러 종류면 우선순위(에러>Suspense>포탈) 색 하나로 요약한다(정확한 종류는 줌인하면 프레임으로 보임). 겸해서 링을 **접힌(collapsed) 그룹에만** 그리도록 게이팅했다 — 펼쳐진 그룹은 안쪽 정밀 프레임이 이미 있어 이중 표시가 되던 걸 없앤다("노드 보이면 프레임, 안 보이면 링" 딱 하나씩). 이로써 경계 표현이 전부 "점선 색 외곽선" 한 언어로 통일됐다. 데모가 세 경계를 동시에 켠 건 시연용 예외 상황(실전에선 한 도메인에 보통 0~1종)이라 정상 사용에선 조용하다. `npm run test` 전체 **280개 그린**. 지도 모드에서 PortalModal.tsx=teal, ErrorBoundaryDemo.tsx=rose, Reports/SuspenseDemo=violet 점선 링을 스크린샷으로 확인.

> **동시 세션 빌드 충돌 메모:** `npm run build`(tsc)는 이 라운드 내내 다른 세션의 미완 편집으로 빨간 상태였다(ADR-0040 미사용 import → 이후 hover 기능의 `domInteraction.test.ts` 목 불일치). 전부 내 파일 밖이고(내 파일은 tsc 에러 0, vitest 275 그린), 각 세션 소유라 여기서 고치지 않는다.
