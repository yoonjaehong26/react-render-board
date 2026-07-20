# 프로젝트 현황 종합 (Project Status)

> 이 문서는 지금까지의 모든 조사·실험·검증을 한 곳에 체계화한 **살아있는 스냅샷**이다. 세부 근거는 각 [`decisions/`](decisions/) ADR에 있고, 여기서는 "지금 우리가 어디 있고, 무엇이 확실하며, 무엇이 남았는가"만 요약한다.
>
> - 최종 갱신: 2026-07-19
> - 현재 단계: **판단 지점 통과 + 백로그 5건(P0~P4) 해소 완료 + 정식 재구현 1라운드(테스트 커버리지·배포 준비·훅킹 라이브러리 확정) 완료 + 보드↔실제 DOM 양방향 인터랙션 구현 완료(ADR-0024/0025/0026) + UX 레이어 2라운드(검색+다크모드/팔레트, ADR-0027) + 3라운드(그룹 접기/펼치기+컨텍스트 메뉴+스티키노트, ADR-0031) + 그룹+개별 동시 필터(ADR-0033) 완료 → UX 레이어 원래 후보 표가 전부 구현됐다. 남은 건 코드접근(스키마 확장 선행)·JSDoc 툴팁(별도 리서치 필요)뿐**
> - 엔진(훅킹→데이터→시각화)은 vitest 유닛 테스트 335개(31파일) + 기존 Playwright 통합 검증으로 뒷받침되고, `src/index.ts` 공개 API·라이브러리 빌드(`npm run build:lib`)까지 준비됐다(ADR-0023). 실행 경험(`npm run dev`)도 바뀌었다 — 계측 대상 데모 앱이 전체 화면을 쓰고, 화면 하단 도킹 패널(ADR-0025)로 보드를 열고 닫으며, 보드 노드 클릭↔실제 화면 요소 클릭이 서로 연결되고(ADR-0026), 검색+필터로 컴포넌트/도메인을 바로 찾고 다크모드+도메인별 색으로 구조를 구분하며(ADR-0027/0033), 그룹을 접고 펼치고 우클릭 메뉴로 빠른 액션을 쓰고 캔버스에 메모를 남길 수 있다(ADR-0031, 2절 참고). 코드접근/JSDoc 툴팁은 여전히 없다.

---

## 1. 한눈에 보기

| 질문 | 답 | 근거 |
|---|---|---|
| 기술적으로 되는가? | **된다** (실시간 Fiber 훅킹 → 데이터 정규화 → 캔버스 시각화가 실제 앱에서 동작) | ADR-0005·0008·0009 |
| UI 철학이 통하는가? | **통한다** (영역 그룹핑 + semantic zoom이 실제 앱에서도 읽힘) | ADR-0006·0009 |
| 실제 제3자 앱에서 버티는가? | **소~중 규모(수백 개)는 통과.** 대규모(수천 개)는 명확한 한계 확인 | ADR-0009·0014·0015 |
| 다양한 React 패턴을 커버하는가? | **커버한다** (class/에러바운더리/concurrent/lazy+Suspense/라우팅/포털 전부 통과) | ADR-0010·0011·0015 |
| 지금 정식 재구현을 시작해도 되는가? | **된다.** 아래 "확인된 결함" 5건(P0~P4)을 이번 라운드에서 전부 해소했다 | ADR-0012~0019 |
| 지금 실제로 "쓸 수 있는 도구"인가? | **엔진+배포 셸+양방향 인터랙션+검색+테마+그룹 접기+컨텍스트 메뉴+스티키노트+필터까지는 그렇다.** 보드 열고 닫기, 노드↔실제 화면 요소 서로 찾기, 컴포넌트/도메인 검색+필터(매치만 표시), 다크모드+도메인별 색 구분, 그룹 접기/펼치기, 우클릭 빠른 액션, 캔버스 메모가 실사용 가능한 수준으로 구현됐다. 코드접근/JSDoc 툴팁은 여전히 없다 | 아래 2절 |
| 장기 생존이 보장되는가? | **전략 논의 의도적 보류** — 기능 완성 후 재개(7-2). 지금은 "전부 완성"이 기본값 | vision.md, 7-2 |

**한 줄 요약:** 기술·철학·호환성은 실제 앱에서 검증 완료. 대규모 성능/시각화에 있던 구체적 결함 5건(전부 시각화·직렬화 레이어의 국소적 문제, 데이터 스키마 같은 근본 결함 아님)도 이번 라운드에서 전부 해소했다(ADR-0016~0019). 다만 이건 "엔진"이 완성됐다는 뜻이지 "제품"이 완성됐다는 뜻은 아니다 — 사용자가 만질 편의 기능은 조사만 됐고 구현은 안 됐다(2절). 생존 전략은 완성 후로 미뤄뒀으니, 지금 할 일은 이 엔진 위에 실제 기능을 얹는 것이다.

---

## 2. 지금 구현된 기능 (실행하면 뭐가 보이는가)

`npm run dev`로 실행하면 계측 대상 데모 앱이 전체 화면을 채우고, 우측 하단 플로팅 버튼으로 화면 하단 도킹 패널(높이 45vh)을 열어 그 앱의 렌더 트리를 실시간으로 볼 수 있다(ADR-0025) — 이게 이 프로젝트의 실제 결과물이다.

### 🟢 엔진 — 완성, 실제 앱 3개(excalidraw·berry-admin·shadcn-admin)로 검증됨

| 레이어 | 파일 | 하는 일 |
|---|---|---|
| 훅킹 | `src/hooking/{fiberInspector,domInteraction}.ts` | bippy로 커밋마다 Fiber 트리 접근, DOM↔Fiber 양방향 매핑 |
| 데이터 | `src/data/{serialize,sourceHints,store,types}.ts` | Fiber → 정규화 노드, groupHint 비동기 해석(+폴더 그룹핑용 전체 경로 groupPath는 `_debugStack` 파싱, ADR-0053), 구독 가능한 store(+id→Fiber 보조 조회) |
| 시각화 | `src/visualization/` | React Flow 기반 그룹 프레임+노드, 그룹 경계 횡단 엣지, semantic zoom(지도↔상세), host 노드 기본 숨김, 도킹 패널 셸(`BoardOverlay.tsx`) |

보드에서 실제로 되는 것: 실시간 렌더 트리 관찰, 도메인별 그룹 프레임, 줌아웃 시 지도 모드/줌인 시 상세 모드 전환("지도에서도 상세" 토글로 줌아웃해도 내부 유지, ADR-0049), host 노드 토글, 수천 개 노드까지 안 뭉개짐(P0~P4 반영 후), 리스트(같은 종류 형제 ≥5)는 대표 하나 + "×N"으로 접어 구조 안정화(ADR-0046), **"폴더로 묶기" 토글로 파일 그룹을 상위 폴더 프레임으로 2단 중첩(folder>file>component, ADR-0053)**, **그룹 간 배치는 downfall tidy-tree 중앙 정렬(부모를 자식 스팬 중앙 위에, 대칭 트리; ADR-0058이 ADR-0056 부모 앵커의 우측 치우침을 대체)**, **공유 UI 레인(pillar ②, ADR-0061): 다중 부모(groupParents≥2) 컨테이너를 트리에서 빼 아래 별도 "공유" 밴드(부모 centroid 아래)로(남은 트리 순수화·요동 0) — 상시 긴 선 대신 사용처에 "↘X 공유" 인라인 칩(전체 연결은 호버 점등 예정)+"×N 사용" 배지, Dialog fixture로 실증, 증분2(자식 있는 공유 컨테이너 — 레인 안 미니 tidy-tree)까지 완료** — 남은 안정성 설계(슬롯 예약 "학습·동결 지도", pillar ③)는 [설계 확정 문서](research/2026-07-18-stable-skeleton-shared-ui-lane.md)로 동결(지터 통증 검증 후). 고빈도 앱(60~240Hz)에서도 store notify 스로틀(~30Hz 캡) + 안 바뀐 노드 참조 재사용으로 과도한 재렌더/깜빡임을 줄임(ADR-0050).

### 🟢 보드 ↔ 실제 DOM 양방향 인터랙션 — 구현됨 (ADR-0024/0025/0026, hover 프리뷰 ADR-0038)

- **정방향**: 보드에서 컴포넌트 노드를 클릭하면 대응하는 실제 화면 요소에 하이라이트 테두리가 잠깐(1.6초) 뜬다. 도킹 패널이라 보드를 안 닫아도 실제 화면이 항상 보인다. **더블클릭하면 그 실제 요소로 스크롤 이동 + 하이라이트**(ADR-0043) — 오버레이 패널에 가려지거나 스크롤로 밀려난 요소를 한 번에 데려온다(라우터는 안 건드림: 노드로 보인다 = 이미 현재 라우트에 마운트됨).
- **역방향**: 계측 대상 앱에서 Alt(⌥)+클릭하거나 "요소 선택" 모드를 켠 채 클릭하면, 그 요소에 대응하는 보드 노드로 자동 이동+강조되고 그 실제 요소에도 하이라이트가 뜬다. 평소 클릭(Alt 없음, 픽 모드 꺼짐)은 전혀 건드리지 않는다 — 처음 구현은 모든 클릭에 반응해 정상적인 앱 조작을 막는 회귀가 있었고, 실측(`scripts/verify.mjs`)으로 발견해 고쳤다(ADR-0026).
- **hover-follow 프리뷰(ADR-0038)**: 픽 모드를 켠 채 마우스를 움직이면 커서 아래 요소가 실시간으로 강조돼(깔끔한 테두리 + 옅은 대각선 헷칭) "클릭하면 이게 선택된다"를 미리 보여준다(react-scan/DevTools 엘리먼트 피커 모델). 헷칭은 CSS 그라디언트라 요소 크기 무관·JS 계산 0 + rAF 스로틀 + 픽 모드일 때만 리스너라 비용 O(1). (처음엔 노드용 정적 rough 이미지를 늘려 썼다가 큰 요소에서 통짜로 칠해지는 걸 실측으로 발견해 교체.)
- **패널 크기 조절 + 도킹 전환(ADR-0040)**: 도킹 패널을 안쪽 가장자리 드래그로 크기 조절하고, 상단 모서리 알약 컨트롤로 하단/좌/우 사이드바로 위치를 바꿀 수 있다(localStorage로 유지, 크기는 화면 비율로 저장해 방향 전환·창 리사이즈에도 유지). **오버레이 전용** — 패널은 위에 떠서 덮기만 하고 계측 대상 앱의 레이아웃/CSS는 절대 안 건드린다(관찰 도구가 관찰 대상을 바꾸지 않음, react-scan/TanStack 모델). 가려진 부분은 패널 이동/크기조절/닫기로 본다.
- 데이터 스키마(`RenderNode`)는 그대로다 — id→Fiber 보조 조회(`fibersById`)와 완전히 분리된 `interactionStore`로 얹었다.

### 🟢 검색 하이라이트 + 자동 이동, 다크모드 + 도메인별 커스텀 팔레트 — 구현됨 (ADR-0027)

- **검색**: 툴바에서 컴포넌트명/도메인명을 검색하면 매치된 노드가 강조되고 나머지는 흐려진다. 매치가 지금 뷰포트 밖이나 지도 모드로 접힌 그룹 안에 있어도 자동으로 그 그룹이 펼쳐지고 카메라가 이동한다 — ui-philosophy.md의 "검색으로 탈출구 마련" 원칙이 실제로 큰 트리에서도 작동한다.
- **다크모드/팔레트**: 툴바의 토글로 라이트/다크를 전환하고(새로고침 후에도 유지), 그룹 이름 해시 기반 8색 고정 팔레트로 도메인마다 다른 색이 그룹 프레임·컴포넌트 노드·미니맵에 일관되게 반영된다.
- 구현 과정에서 다른 세션이 병행으로 컴포넌트 노드 테두리를 rough.js 손그림 스타일로 바꾸는 작업을 발견해(커밋 안 됨, `border: none`+`background-image`) 검색 강조는 `outline`으로, 팔레트는 인라인 스타일이 아닌 정적 `--palette-N` 클래스로 설계를 조정했다. 또한 역방향 인터랙션(ADR-0024/0026)이 접힌 그룹 안 노드를 못 가리키던 gap을 발견해 같은 라운드에서 함께 고쳤다.

### 🟢 그룹 접기/펼치기, 우클릭 컨텍스트 메뉴, 캔버스 스티키노트 — 구현됨 (ADR-0031)

- **그룹 접기/펼치기**: 그룹 헤더의 셰브런으로 접고 펼친다. 검색 매치/역방향 착지가 걸린 그룹은 수동 접기보다 우선해 강제로 펼쳐진다("검색은 언제나 이긴다", ADR-0027 원칙의 연장).
- **우클릭 컨텍스트 메뉴**: 그룹 우클릭 → 접기/펼치기 토글 + 이 그룹으로 확대. 컴포넌트 우클릭 → 실제 화면에서 보기(정방향 하이라이트) + 이 이름으로 검색.
- **캔버스 스티키노트**: 툴바의 "메모 추가"로 자유 배치 메모를 만들고, 텍스트 편집/드래그 이동/삭제가 되며 localStorage로 새로고침 후에도 유지된다.
- 구현 과정에서 접기/펼치기 토글을 그룹 헤더 안의 평범한 버튼으로 넣었더니 그룹 프레임(`zIndex:-1`)보다 위에 있는 엣지의 넓은 클릭 판정 영역이 클릭을 가로채는 gap을 `scripts/verify-ux-round3.mjs`(Playwright)로 발견해, `<NodeToolbar>`(포탈 렌더, zIndex 직접 지정 가능)로 바꿔 고쳤다.

### ⚪ 왼쪽 "계측 대상 앱"에 있는 테스트용 컴포넌트 (`src/fixtures/`)

검증 라운드마다 하나씩 쌓인 것 — 제품 기능이 아니라 이 도구 자체를 테스트하기 위한 fixture:

- `domains/shell`, `domains/checkout` — 기본 도메인 구조 (그룹핑 확인용)
- 알림 패널 토글 버튼 (`domains/notifications`) — 컴포넌트 통째 마운트/언마운트 재현
- `domains/advanced` — class 컴포넌트, 에러 바운더리, `useTransition`, Suspense 데이터 페칭
- `domains/reports` — `React.lazy` + Suspense 코드 스플리팅
- `domains/livefeed` — 10~240Hz 고빈도 갱신 버튼
- `domains/stress` (`?stressCount=` 쿼리로만 켜짐) — 수천 개 컴포넌트 스트레스

### 🟢 UX 레이어 — 6개 완료(ADR-0027/0031/0033), 코드접근·JSDoc 툴팁만 남음

[`docs/research/2026-07-17-react-flow-ux-capabilities.md`](research/2026-07-17-react-flow-ux-capabilities.md)가 조사한 후보 중 명확한 선행 조건이 있는 2개(코드로 점프, JSDoc 툴팁)만 빼고 전부 구현했다:

| 기능 | 상태 |
|---|---|
| 검색 하이라이트 + 자동 이동 | ✅ **완료(ADR-0027)** — 컴포넌트명/도메인명 검색 시 강조+흐림+자동 카메라 이동, 접힌 그룹도 강제로 펼침 |
| 그룹+개별 동시 필터(도메인 통째로 숨기기) | ✅ **완료(ADR-0033)** — "매치만 표시" 체크박스로 매치 없는 그룹은 프레임째, 매치 안 된 개별 노드는 단위로 아예 안 만듦(`hidden` 부모→자식 비전파 함정을 "안 만들기"로 회피) |
| 캔버스 주석(스티키노트) | ✅ **완료(ADR-0031)** — 자유 배치 메모, localStorage 영속화, 텍스트 편집/드래그/삭제 |
| 컴포넌트 코드로 점프 | 미구현 — 현재 `lineNumber`/`columnNumber` 자체를 데이터 레이어에서 버리고 있어(`sourceHints.ts`), 스키마 확장이 선행 조건. 3라운드 착수 전 재확인해서도 제외 확정 |
| 다크모드/테마 변경 + 도메인별 커스텀 팔레트 | ✅ **완료(ADR-0027)** — `colorMode` 토글(localStorage 유지) + 커스텀 노드(`ComponentNode`/`GroupNode`) 다크 대응 + 그룹 이름 해시 기반 8색 팔레트 |
| 그룹 접기/펼치기 | ✅ **완료(ADR-0031)** — 그룹 헤더 셰브런(`<NodeToolbar>`)으로 토글, 검색/역방향이 수동 접기보다 우선 |
| NodeToolbar/컨텍스트 메뉴 | ✅ **완료(ADR-0031)** — 우클릭 메뉴로 그룹(접기·확대)/컴포넌트(하이라이트·검색) 빠른 액션 |
| 코드 주석(JSDoc) 표시 | 조사 결과 **근본적 제약 발견** — `getSource`가 "사용 위치"만 주는 설계(ADR-0007)와 정면 충돌해 별도 리서치 필요. 3라운드 착수 전 재확인해서도 제외 확정 |

**요약: 원래 후보 표(필터/주석/코드접근/테마/그룹접기/컨텍스트메뉴) 전부 구현 완료 — 코드접근과 JSDoc 툴팁 둘만 남았고, 둘 다 데이터 스키마 확장이나 별도 리서치라는 명확한 선행 조건이 있어 의도적으로 미뤄둔 상태다.**

### 🟢 시각 언어(도형·손그림) — 도형 어휘(6각형/포탈/경계) + 손그림 대부분 구현(ADR-0035), 워드마크 폰트 에셋만 남음

사용자 Figma 다이어그램의 가독성 기법을 이 도구에 옮기는 작업. 색/배경(도메인=색)은 ADR-0027 팔레트로 완료됐고, 나머지는:

| 요소 | 상태 |
|---|---|
| 손그림 시각 정체성(Excalidraw풍 rough.js) | 🟢 **대부분 구현([ADR-0030](decisions/0030-excalidraw-hand-drawn-visual-identity.md)/[ADR-0035](decisions/0035-shape-and-hand-drawn-implementation.md))** — 노드 테두리 정적 SVG 스케치(노드 수 무관 O(1), `roughStyle.ts`). **다크 대응 테두리 6장, 강조 마커·햇칭, 볼펜 세기 크롬, 워드마크 손글씨 마크업**, 그리고 사용자 피드백으로 **노드 rough 세기 강화 + 펼쳐진 그룹 프레임 rough(크기 버킷 메모이즈)** 추가. 플로팅 버튼을 원형 FAB+픽 위성으로 바꾸며 **rough 원 크롬(`CHROME_CIRCLE`)으로 확장**([ADR-0037](decisions/0037-circular-floating-button-with-pick-satellite.md)). **남은 것: 워드마크 OFL 웹폰트 에셋(오프라인 미확보, 지금은 시스템 손글씨 폴백)** |
| 도형 = 역할(라우트 6각형/경계/포탈) | 🟢 **전부 구현·데모 확인([ADR-0035](decisions/0035-shape-and-hand-drawn-implementation.md))** — 라우트 6각형(`group`이 `page.tsx`로 끝나는 진입 노드, clip-path), 포탈 표식(⧉), Suspense 경계(⏳ 점선), 에러 바운더리(🛡 점선) 전부. **실측 결과 셋 다 스키마 변경 없이 `fibersById` 사이드채널 파생으로 가능**(`roleMarkers.ts` — 노드 fiber의 `.return`을 올라가 경계 감지, 경계당 콘텐츠 루트 1개에만 표식). 데모 fixture(포탈 모달·보고서 lazy/Suspense·에러 유발)로 실행 화면 확인. Context 마름모는 여전히 별도 실험 보류(ADR-0028 스코프 밖) |
| 간선 클러터 감쇠(스타일/LOD/hover/색) | 🟢 **구현([ADR-0041](decisions/0041-edge-clutter-attenuation.md) a·b + [ADR-0044](decisions/0044-hover-lineage-highlight.md) c + [ADR-0047](decisions/0047-always-on-parent-colored-edges.md) 색)** — ADR-0029 결정 #4(연구문서 7절 `a→b→c` 순서)를 구현했다. **a. 시각적 감쇠**: 그룹 내 간선은 hairline + 그룹 내 깊이별 opacity(d1 0.70>d2 0.50>d3 0.35)로 죽이고, 그룹 간 간선은 현행 강도 유지("잉크를 정보 가치에 비례" — 위치가 이미 말해주는 그룹 내는 죽이고 위치가 못 말해주는 그룹 간은 살림). **b. 단계형 LOD**: 이진(지도=전부 숨김↔상세=전부 표시)을 3단으로 — 중간 줌(`zoom-mid`)은 구조 간선(그룹 횡단+얕은 깊이)만, 더 줌인하면 깊은 detail 간선 페이드인. 깊이는 그룹 경계에서 리셋돼 라이브 안정성이 레이아웃에서 상속(배선기 없음). **c. hover 혈통 점등**: 노드에 hover하면 조상 체인+자손 서브트리 간선만 **굵게(width 3)+부모 도메인 색**으로 강하게 점등(깊이감쇠·LOD 무시)하고 나머지는 거의 지우며(0.04), **혈통 노드까지 강조**(비혈통 노드 0.18로 흐리게, `LineageNodesContext`로 flowNodes 재생성 없이) — 상시 감쇠가 못 없앤 잔여 클러터를 on-demand로 해소, 검색 dimming 메커니즘 재사용, 간선만 대상이라 flowNodes 불변(ADR-0017). 부모 색(선 정체성, 조상 체인이 그룹 경계를 넘으면 색이 바뀜)은 상시가 아니라 hover에서만 입혀 감쇠를 안 되돌린다. hover=구조 혈통 / 클릭=데이터 흐름(ADR-0032) 상보. **색(ADR-0047): 간선 3채널을 직교로 — opacity=깊이 감쇠 / hue=부모 도메인 색 / 선 스타일=그룹 내 실선·경계 점선.** 사용자 지적("이미 opacity로 감쇠했으니 색까지 감쇠 불필요")으로 ADR-0044의 "부모색 hover 한정"을 뒤집어 **상시** 부모 도메인 색 적용 — 같은-그룹은 부모가 그 그룹 안이라 그룹당 단색이 돼 haze가 아니라 도메인 응집으로 읽히고, 크로스-그룹은 주황 단색 폐지→점선+출처 도메인색(정보량 순증). 감쇠(opacity)는 그대로. 라이트/다크 실측(`verify-output/edge-parent-color/`). **크로스-그룹 프레임 폴백(ADR-0048, 버그 수정)**: "wide view엔 보이다 확대하면 사라지던" 크로스-그룹 연결 — 부모 노드가 뷰포트 컬링되면(ADR-0017) 간선을 버리지 않고 부모 그룹 프레임(항상 렌더)으로 잇는다(`edge-cross-group-frame`). 실측 z=61%→73%에서 14→0 소멸이 14→6 유지로. 신규 fixture `deeptree`(깊이 1~5 단일 그룹) + `verify:edge-clutter`·`verify:edge-lineage`·`verify:edge-frame-fallback`로 실측. 감쇠 예외: props 흐름 장식. **색 언어를 노드까지 확장(ADR-0055)**: 간선·프레임에 이어 **컴포넌트 노드 테두리**도 부모 도메인 팔레트 색으로(composite/route만, host는 중립 대시 유지, pending은 폴백) — 줌인으로 프레임이 컬링돼도 노드 색이 도메인 단서로 남는다(ADR-0048과 같은 동기). 프레임>테두리>tint 3단 위계, haze 없음(그룹당 단색, ADR-0047 논증 상속), 정적 이미지 32개만 프리컴퓨트. **타깃 색 그라데이션(ADR-0059)**: 버스 후에도 "허브 단색 선이 뭉쳐 구별 안 됨"(한 도메인이 여럿 렌더 → 1:1 간선이 전부 출발색 단색, 정보는 타깃에 있음). 크로스-그룹 간선을 **출발→타깃 도메인 색 그라데이션**으로 그려(`OrthoEdge` userSpaceOnUse linearGradient, base 팔레트 CSS는 이기고 hover/추적 !important엔 solid 복귀) 끝색으로 "어디로 가는지"를 색으로. 레인 폭 ±12→±16(관통 0 유지). 실측 9/9 ortho·관통 0·에러 0. **유예(downfall 완성 중, 버스 통합과 함께)**: 그룹선(edge-group-link) 색 통일 + 그룹선 경로 최적화(버스는 아님). corridor-local sticky 트랙(진짜 교차 최소화)·공유 컴포넌트 레인. 남은 것: 7절 d(버스 획 병합=배선), e(그룹 내 간선 생략=급진안). |
| 직교 배선(선 정리) | 🟢 **v2 구현([ADR-0051](decisions/0051-rule-based-cross-group-edge-routing.md)) + v3 설계·Phase 1·2·3([ADR-0054](decisions/0054-edge-routing-v3-coordination-design.md))** — ADR-0029 §5(규칙 기반, libavoid 아님). 실측으로 **그룹 내 버스는 smoothstep이 이미 정렬**(중점 채널 공유)임을 확인해, **크로스-그룹 간선만** 커스텀 `ortho`로 배선한다: 그룹 프레임을 장애물로 **Hanan-그리드 A***(굽힘 페널티 + `useMemo` 캐시)로 **완전 회피** 배선(`edgeRouting.ts` 순수함수 → 라이브 안정성 상속). 우회로가 있으면 반드시 찾아 벽 사이 통로도 통과(유닛 8개), 실측 외부 프레임 관통 0(`verify:edge-routing`). "데모가 너무 깨끗해 관통이 과소평가"라는 사용자 지적으로 실제 앱(49~80그룹) 밀도가 배선을 정당화함을 확인. **v3 설계·Phase 1 완료(ADR-0054)**: 색 언어를 카디널리티로 확정(구조=도메인색+레인, props=per-flow 색, ADR-0045 A/B 해소) + 아키텍처를 간선별 A*→중앙 배선 pass로 전환. **Phase 1**: 크로스-그룹 간선의 레인 오프셋을 출발 x 위치 순으로 배정하는 중앙 테이블(`EdgeLanesContext`)로 교체(hash 무작위 대체, 같은 출발=같은 레인=버스 묶음 시작). **Phase 2**: `routeCrossGroupBuses`로 출발별 **트렁크(수직 공유)+바(수평, 소스 프레임 아래 거터, 레인 y 분리)+타깃별 스텁** 병합 — OrthoEdge가 간선별 A* 대신 중앙 맵(`EdgeBusPathsContext`)을 읽음(결정2 전환). 병합이 다른 프레임을 관통하면 그 간선만 A* 폴백해 **관통 0 유지**(실측 6/6). **Phase 3(ADR-0060)**: corridor-local sticky 트랙 — `assignGutterTracks`로 출발을 소스 프레임 y-층별로 묶어 x-순 barY 트랙 스택(같은 층 버스 바가 겹치지 않고 층층이, ShopProductCard×5 등). tidy-tree(ADR-0058)가 층을 가로 밴드로 만든 덕에 "거터별 1D 트랙"으로 쪼갬. 아래로만이라 프레임 침범 0, 넘침은 버스 폴백. 색: 크로스-그룹 실선+출발→타깃 도메인 색 그라데이션(ADR-0059, 허브 단색 뭉침 보완). **남김(v3 Phase 4 + )**: props 평행 색 줄기, cross-layer·공유 컴포넌트·수직 corridor 트랙. 실제 앱 대규모 실측(9000노드 렌더가 자동화 막음). 간선 위 props 라벨([ADR-0039](decisions/0039-lod-edge-prop-labels.md))도 v3와 함께. [조사](research/2026-07-18-orthogonal-edge-routing.md) |

### 🟡 데이터 스코프 확장(props/전역상태) — props는 구현 완료, 전역상태는 보류

렌더 트리를 넘어 데이터 흐름까지 보여주는 프론티어. 세 갈래로 난이도가 갈린다:

| 스코프 | 상태 |
|---|---|
| props 흐름 추적 + 변경 잔상(afterglow) | ✅ **완료([ADR-0032](decisions/0032-props-flow-and-change-afterglow.md), 2026-07-18)**. 스키마 불변 — `fibersById`(클릭당 O(1) 읽기) + 신규 `afterglowStore`로 얹었다. 노드 선택→우선순위 정렬 props 패널(`propsFlow.ts`/`PropsPanel.tsx`), 변경 감지(b1: memoizedProps vs alternate), prop 클릭→자손 참조 추적(간선 경로 강조+prop 라벨, origin 간선 포함), 변경 흐름(🌊 토글 — props가 바뀌면 데이터가 부모→자식 간선을 타고 흐르는 애니메이션이 주 표현, 노드 표식은 보조; 지도 모드에선 그룹 단위 "활동 기상도"로 바쁜 도메인 발광+도메인 간 흐름). 선택 시 방금 바뀐 prop 자동 추적. heat/추적은 toFlow data가 아니라 context로 내려 decay 틱마다 flowNodes 재생성을 피했고(ADR-0017 일관), 일시정지는 Canvas 진입점에서 snapshot을 freeze한다. `npm run verify:props-flow`로 통합 검증. props 패널은 이제 **헤더 드래그로 이동 + 좌하단 핸들로 크기 조절**(도킹 아닌 자유 배치, `.canvas` 기준 좌표/크기를 localStorage 영속, clamp로 화면 밖 방지 — [ADR-0052](decisions/0052-props-panel-drag-resize.md)) — "모달이 화면을 가림 + props 많아질 것" 대응, Canvas 불변(전부 PropsPanel 안). **다음: 다중 props 흐름 + 간선 색=부모([ADR-0045](decisions/0045-multi-props-flow-parent-colored-edges.md), 방향 확정 — 완성형은 배선과 공동)**. Context/Zustand는 여전히 보류 |
| Context(Provider→Consumer) | **보류** — 트리를 깨는 새 간선(배선 소환). 기술은 깨끗함(`fiber.dependencies`/bippy `traverseContexts`). "나중에 필요해지면"(ADR-0032) |
| Zustand/외부 스토어 | **보류** — Fiber 트리 밖, `useSyncExternalStore` 휴리스틱만 가능(익명·불안정). 스파이크 또는 안 함(ADR-0032) |

---

## 3. 지금까지의 여정

```
사전조사 → 실험 1·2 → 그룹핑 힌트 검증 → 라이브 MVP → 판단 지점(excalidraw)
   → [백로그 수정 + 5개 축 스트레스 테스트] → 정식 재구현 직전 (지금 여기)
```

| 단계 | 내용 | 결과 | ADR |
|---|---|---|---|
| 사전조사 | 죽은 선행 프로젝트 원인 분석 | 죽은 이유는 기술이 아니라 **동기**(부트캠프 코호트 종료). React-Sight만 기술적 죽음(devtools-only 실패) | [prior-art](research/prior-art.md) |
| 실험 1 | bippy로 Fiber 트리 추출 | 가능 확인. `secure()` 부재(문서-코드 드리프트) | [0005](decisions/0005-exp1-fiber-extraction-feasibility.md) |
| 실험 2 | React Flow로 그룹핑 + semantic zoom | 철학 유효. 257노드까지 안 뭉개짐 | [0006](decisions/0006-exp2-flow-prototype-ui-validation.md) |
| 그룹핑 힌트 검증 | `getSource`로 소스 경로 추출 | dev 전용으로 가능(prod 불가). "사용 위치" 의미로 고정 | [0007](decisions/0007-grouping-hint-feasibility.md) |
| 라이브 MVP | 3-레이어 실시간 통합 | 동작 확인. tag 기반 필터 통일 | [0008](decisions/0008-live-mvp-integration.md) |
| **판단 지점** | excalidraw(646노드) 실제 앱 검증 | **조건부 GO.** 결함 2건 발견 | [0009](decisions/0009-real-app-validation.md) |
| 백로그 수정 | 그룹핑 노이즈 + 레이아웃 성능 | 노이즈 15%→0%, 지연 2.76배→1.6~1.77배 | [0012](decisions/0012-grouping-noise-and-layout-perf-fix.md) |
| 호환성 | class/에러바운더리/concurrent/Suspense | 5패턴 전부 스키마 변경 없이 통과 | [0010](decisions/0010-legacy-and-concurrent-compatibility.md)·[0011](decisions/0011-lazy-suspense-code-splitting.md) |
| 스트레스: 고빈도 | 10~240Hz 지속 갱신 | 10~30Hz가 실질 한계. 디바운스만으론 부족 | [0013](decisions/0013-high-frequency-render-stress-test.md) |
| 스트레스: 대규모 | 수천 노드(합성 + shadcn-admin 9,240노드) | 1,500~2,000노드부터 붕괴. **MAX_DEPTH 버그** 발견 | [0014](decisions/0014-thousands-of-components-stress-test.md) |
| 스트레스: 라우팅 | berry-admin 라우트 전환 + 코드 스플리팅 | 데이터 레벨 클린. **카메라 정체** 등 발견 | [0015](decisions/0015-routing-transition-validation.md) |
| **백로그 해소** | P0~P4 결함 5건 순서대로 수정(프로파일링 → 뷰포트 기반 부분 재계산 → 지도 모드 LOD/카메라 refit → 그룹핑 화이트리스트 반전) | 5건 전부 해소. 응답 배율 초선형→~1배 평탄화, 지도 모드 백지→콘텐츠 표시, 카메라 자동 추적 | [0016](decisions/0016-max-depth-sibling-counting-fix.md)–[0019](decisions/0019-library-hint-whitelist-inversion.md) |
| 배포/진입 UX 방향 | 연결 방식(CLI 자동 초기화) + 노출 위치(같은 페이지 플로팅 버튼+포탈) 결정, 4개 번들러 기술 검증 | 방향 확정 → **연결 방식 구현 완료(ADR-0036)**: CLI init(Vite 자동 패치) + Vite 플러그인(1순위) + webpack/Rspack/Turbopack 조건부 + dev 전용 삼중 가드. 노출 위치는 ADR-0025로 이미 완료 | [0020](decisions/0020-distribution-entry-ux-direction.md)·[0021](decisions/0021-bundler-injection-feasibility.md)·[0036](decisions/0036-distribution-connection-implementation.md) |

> 이 과정에서 여러 Claude Code 세션이 같은 저장소를 병행 편집했고, ADR 번호 충돌·fixture 설계 수렴이 반복적으로 발생했다. 매번 다음 빈 번호로 조정하고 서로 상호 참조하는 방식으로 정리했다(ADR-0012·0013·0014의 병행 세션 메모 참고).

---

## 4. 확실히 "되는" 것 (검증 완료)

실제 제3자 앱에서 재현 가능하게 검증된 것들. 정식 재구현에서 **그대로 신뢰하고 이어받아도 되는** 자산이다.

- **훅킹 레이어 (1레이어) — 견고함.** bippy `instrument({ onCommitFiberRoot })` + 수동 try/catch + devtools-only 실행 + 재귀 가드. 세 번의 실제 앱(excalidraw, berry-admin, shadcn-admin)에서 콘솔 에러 0건, 대상 앱을 멈추지 않음(React-Sight가 죽은 지점을 재현하지 않음).
- **데이터 레이어의 정합성 — 견고함.** 라우트 전환으로 대형 서브트리가 통째로 교체돼도 id 유일성 유지, 왕복 후 노드 수치 완전 일치, 고아 노드/중복 id 0건(ADR-0015 ①④).
- **React 패턴 호환성 — 넓음.** 함수/class 컴포넌트, 에러 바운더리, `useTransition`, `use()`+Suspense, `React.lazy` 코드 스플리팅, 포털(논리적 부모 아래 정확히 배치), memo/forwardRef(정확한 이름). 전부 **추가 스키마 변경 없이** 기존 tag 기반 분류로 커버됨.
- **UI 철학 — 실제 앱에서도 읽힘.** 영역 프레임 + 실제 노드 유지 + semantic zoom(지도↔상세)이 646노드 실제 앱에서 그대로 작동. host 노드 기본 숨김이 "DOM 뷰어가 아니라 컴포넌트 보드"라는 정체성을 살림.
- **그룹핑 힌트 — 소~중 규모에서 유효.** `getSource`의 "사용 위치" 기준 그룹핑이 excalidraw 규모(80그룹)에서 85%가 의미 있는 도메인 파일로 잡힘.

---

## 5. 확인된 결함과 한계 (정식 재구현 백로그)

전부 **시각화(3레이어) 또는 직렬화 코드의 국소적 문제**였으며, 데이터 스키마·훅킹 방식 같은 되돌리기 어려운 근본 결함은 아니었다. **2026-07-17, P0~P4 다섯 건 전부 순서대로(의존관계상 P0→P1→P2+P3→P4) 해소했다** — 상세 수치는 각 ADR 참고.

### ✅ P0 — MAX_DEPTH 형제-카운팅 버그 (`src/data/serialize.ts`) — 해소됨
- **증상이었던 것:** 재귀 순회의 depth 가드(`MAX_DEPTH=200`)가 트리 깊이뿐 아니라 "한 부모 밑 형제 수"에도 소모돼, flat한 자식이 ~100개(실측)를 넘으면 그 이후가 콘솔 경고만 남기고 조용히 사라졌다.
- **수정:** depth 가드를 자식 방향 재귀에만 적용하고, 형제 순회는 반복문(iterative)으로 바꿔 별도의(사실상 무제한, 순환 참조 방어용) 카운터로 분리했다.
- **결과:** shadcn-admin(`/users?pageSize=100`) 총 노드 수 9,240 → **9,818**, `MAX_DEPTH` 경고 588~3,189건 → **0건**.
- 근거: [ADR-0016](decisions/0016-max-depth-sibling-counting-fix.md)

### ✅ P1 — Canvas 렌더링 파이프라인의 초선형 비용 — 해소됨
- **증상이었던 것:** 인터랙션 응답 배율이 노드 수에 초선형으로 악화. 646노드 1.6~1.77배 → 1,000노드 10.85배 → 2,000노드대 31.6배(합성) → 5,000노드 응답 불능.
- **프로파일링으로 확인한 진짜 원인:** `normalizeForCanvas`/`toFlow`는 5,000노드에서도 수 ms에 불과했다 — 진짜 비용은 React Flow가 `nodes` 배열 **크기**(화면에 실제 보이는 개수와 무관)만큼 치르는 내부 wrapper 처리였다. `onlyRenderVisibleElements`(ADR-0012)는 이 비용을 줄이지 못했다.
- **수정:** 뷰포트/지도 모드 기준으로 화면 밖 그룹은 프레임만 만들고 자식 노드·엣지는 아예 만들지 않아, React Flow에 넘기는 배열 자체를 줄였다.
- **결과:** 응답 배율이 646~5,000개 전 구간에서 **0.96~1.26배**로 평탄화(수정 전 2,000개 11.69배, 5,000개 28.32배). 고빈도 렌더 시나리오(ADR-0013, 60Hz 3.85배)도 부수적으로 **1.01배**까지 해소됐다.
- 근거: [ADR-0017](decisions/0017-viewport-based-partial-recompute.md)

### ✅ P2 — 지도 모드 붕괴 (`minZoom=0.05` 하드코딩) — 해소됨
- **증상이었던 것:** 1,500~2,000노드 또는 그룹 100개+부터 `fitView`가 전체를 못 담아 지도 모드 화면이 사실상 백지.
- **수정:** `minZoom`을 0.001로 낮춰 `fitView`가 바닥에 막히지 않게 했고, 그 결과 드러난 "라벨이 안 보이는" 문제는 캔버스 줌의 역수를 라벨에 곱하는 counter-scale로 해결했다.
- **결과:** shadcn-admin 지도 모드 줌 배지가 5%(바닥에 막힘) → 1%(진짜 필요한 값)로 내려가고, 화면이 백지에서 "전체 콘텐츠가 보이고 라벨을 읽을 수 있는" 상태로 바뀌었다.
- **남은 한계:** 그룹이 아주 많을 때(수십~수백 개) 라벨끼리 겹치는 declutter 문제는 완전히 풀지 않았다(P4가 그룹 수를 줄여 상당히 완화하긴 했다) — 후속 과제.
- 근거: [ADR-0018](decisions/0018-map-mode-lod-and-camera-refit.md)

### ✅ P3 — 카메라 정체 (stale viewport) (`Canvas.tsx` / `layout.ts`) — 해소됨
- **증상이었던 것:** `fitView`가 마운트 1회성이라 라우트 전환처럼 레이아웃이 요동치면 새 콘텐츠가 화면 밖에 남았다(로그인 진입 시 226개 중 47개만 화면에, 20.8%).
- **수정:** 그룹 집합의 생존율이 30% 미만으로 떨어질 때만(=대부분 새 그룹으로 교체될 때만) `fitView`를 다시 트리거하는 디바운스된 휴리스틱을 추가했고, `layout.ts`의 `groupOrder`/`groupOrderSet`이 사라진 그룹을 더 이상 무한정 쌓아두지 않도록 pruning을 추가했다.
- **결과:** berry-admin login 라우트 재현에서 "fit-view 조작 전/후 DOM 노드 수가 이미 동일"할 정도로 카메라가 자동으로 따라간다.
- 근거: [ADR-0018](decisions/0018-map-mode-lod-and-camera-refit.md)

### ✅ P4 — 그룹핑 노이즈 판별 커버리지 (`isLibraryInternalHint`) — 해소됨
- **증상이었던 것:** `node_modules` 리터럴 문자열만 검사해, Vite 프리번들 소스맵 경로(`../../@mui/...` 등)는 걸러지지 않고 라이브러리 노이즈 그룹으로 새어나왔다.
- **수정:** "상위 디렉터리로 거슬러 올라가는(`../`) 경로는 프로젝트 소스 루트 밖"이라는 화이트리스트 반전 규칙을 추가했다(4개 앱 전부에서 앱 소스 힌트는 예외 없이 `../` 없는 파일명이었고, 라이브러리 프리번들 경로는 예외 없이 `../`로 시작한다는 실측 패턴에 근거).
- **결과:** berry-admin dashboard 74개 그룹(다수 노이즈) → **16개**(전부 클린), login 45개 → **10개**(전부 클린). shadcn-admin은 49개 중 1개만 예외로 남았는데, 이는 판별 누락이 아니라 조상 체인 전체가 라이브러리로만 이뤄진 경우의 기존(ADR-0012) 의도된 폴백 동작이다.
- 근거: [ADR-0019](decisions/0019-library-hint-whitelist-inversion.md)

### 조사 필요 (원인 미규명, blocker 아님 — 이번 라운드 스코프 밖)
- **메모리 누수 — ✅ 저위험으로 강등(2026-07-20, ADR-0013 후속)** — 격리 15분 재실행 완료. 현재 `0.2.4`(ADR-0017/0050 반영) 코드에서 증가율이 원래 대비 **16배 느려짐**(≈11.5MB/시간 raw), **DOM/리스너 누적 없음**(클래식 누수 반박). 워밍업 후 잔여 창(~6.7MB/시간)이 15분 내 플래토엔 미도달이라 "완전 무누수"로 확정하진 않으나 blocker 아님(실무 위험 낮음). 결정적 확인(30분+)은 실사용 제보 시.
- **대형 라우트에서 groupHint 해석 급락 — ✅ 원인 규명·수정(2026-07-20, ADR-0073)** — 원인은 노드 "개수"가 아니라 **distinct 소스 파일 수(=sourcemap fetch 수)와 그 fetch의 라우트-로드 경합**이었다. `resolveGroupHints`가 pending 전체를 단일 `Promise.all`로 던져 N개의 5초 타임아웃(ADR-0071)이 전부 t=0에 동시 시작 → 큐 뒤쪽 fiber가 "차례 대기"만으로 예산을 태워 null 폴백 → 조상 흡수로 mega-group 붕괴(ADR-0071의 "타임아웃 영구 캐시"가 sticky화). 수정: `getSource` 동시성 8 캡 + 타임아웃 폴백을 정상 null과 구분해 2회 재시도 후 확정. StressGrid 11195노드 실측으로 "개수 가설" 반증. 대형 실제 라우트 정량 delta는 실사용 재측정으로 유예(로컬 fixture는 단일 파일이라 경합 미재현).
- **인터랙션 배율 = f(노드 수 × 커밋 횟수)** — 배율이 노드 수만의 함수가 아님. 정확한 관계식 미규명(ADR-0014).

### ✅ 품질 게이트 누수 — 해소됨 (ADR-0063)
- **증상이었던 것:** 커밋된 `main`이 `npm run build`(타입체크)에서 며칠간 실패(`store.test.ts` 4곳 `groupPath` 누락, ADR-0053이 필수화). vitest는 타입 스트립, publish는 `build:lib`(테스트 제외)만 타서 세 안전망이 전부 놓침 — **배포(0.2.0)는 정당했으나** 개발 타입체크가 방치됐다.
- **수정:** `store.test.ts` 4곳 `groupPath: null` 채워 초록 복구 + `npm run typecheck`(`tsc -b`) 스크립트 + CLAUDE.md "커밋 전 1회" 규칙(무-도구, "과한 프로세스 금지" 원칙). 훅·CI는 재발 증거 쌓이면.
- 근거: [ADR-0063](decisions/0063-typecheck-gate-before-commit.md)

---

## 6. 3-레이어별 건강 상태

| 레이어 | 상태 | 요약 |
|---|---|---|
| **1. 훅킹/백엔드** | 🟢 견고 | 실제 앱 3개에서 크래시 0. 남은 결함 없음. **라이브러리 확정됨(bippy, ADR-0022)**. bippy API 드리프트만 주의(버전업 시 `.d.ts` 직접 확인 규칙 — ADR-0002). `domInteraction.ts`(DOM↔Fiber 매핑, ADR-0026) 추가. 유닛 테스트 17개(`fiberInspector`·`domInteraction`) |
| **2. 데이터** | 🟢 견고 | 정합성·호환성 완벽. **P0 MAX_DEPTH 버그 해소됨**(ADR-0016). `fibersById` 보조 조회 추가(ADR-0026, `RenderNode` 스키마 자체는 불변). 유닛 테스트 29개(`serialize` 10·`sourceHints` 8·`store` 11) |
| **3. 시각화** | 🟢 견고, 대규모까지 검증됨 | 소~중 규모는 물론 대규모(9,000+ 노드, 74개 그룹)에서도 응답성·지도 모드·카메라 추적·그룹 품질 전부 확인. **P1~P4 결함 4건 해소됨**(ADR-0017~0019). 도킹 패널 셸(`BoardOverlay.tsx`, ADR-0025) + 양방향 인터랙션(`interactionStore.ts`/`DomHighlightOverlay.tsx`, ADR-0026) + 검색/다크모드/도메인 팔레트(`search.ts`/`groupColor.ts`/`colorModePreference.ts`, ADR-0027) + 그룹 접기/컨텍스트 메뉴/스티키노트(`stickyNotes.ts`, `ContextMenu.tsx`, `NodeToolbar`, ADR-0031) + 그룹+개별 필터(`toFlow.ts`의 `filterToMatches`, ADR-0033) + 그룹 간 waterfall 층 배치 + 지도 모드 그룹↔그룹 집계 엣지(`layout.ts`의 `computeGroupDepths`, `toFlow.ts`의 `edge-group-link`, ADR-0034) 추가. 유닛 테스트 125개 이상(`lib/*` + 컴포넌트) |

레이어별 유닛 테스트(총 335개, 31파일, vitest) + 기존 Playwright 통합 검증(`scripts/verify*.mjs`)의 역할 분리와 세부 내용은 [ADR-0023](decisions/0023-production-hardening-tests-and-package-prep.md)·[ADR-0026](decisions/0026-bidirectional-interaction-implementation.md)·[ADR-0027](decisions/0027-search-and-theme-ux-round.md)·[ADR-0031](decisions/0031-collapse-context-menu-sticky-notes.md)·[ADR-0033](decisions/0033-group-and-individual-filter.md) 참고. `npm run test`로 실행한다.

---

## 7. 앞으로의 방향성

### 7-1. 정식 재구현 착수 전 반영해야 했던 것 — 2026-07-17 전부 해소 완료
roadmap.md의 "대규모 스케일은 처음부터 설계에 반영" 원칙이 이번 스트레스 테스트로 구체적 숫자와 함께 확인됐다. MVP 코드 단계에서 아래 5가지를 전부 고쳤으므로(순서: P0→P1→P2+P3→P4, 의존관계를 따름), 정식 재구현은 "지금 검증된 이 형태"를 그대로 이어받으면 된다:

1. **직렬화 순회의 depth/형제 카운터 분리** (P0, [ADR-0016](decisions/0016-max-depth-sibling-counting-fix.md)) — ✅ 해소.
2. **Canvas의 뷰포트 기반 부분 재계산** (P1, [ADR-0017](decisions/0017-viewport-based-partial-recompute.md)) — ✅ 해소. "접기/펼치기·검색·부분 렌더링"(roadmap 원안)이 여기 묶였다.
3. **지도 모드의 LOD 렌더링** (P2, [ADR-0018](decisions/0018-map-mode-lod-and-camera-refit.md)) — ✅ 해소(라벨 declutter는 부분 완화, 후속 과제로 남음).
4. **카메라 정책 + `groupOrder` 생명주기** (P3, [ADR-0018](decisions/0018-map-mode-lod-and-camera-refit.md)) — ✅ 해소.
5. **라이브러리 경로 판별의 화이트리스트 반전** (P4, [ADR-0019](decisions/0019-library-hint-whitelist-inversion.md)) — ✅ 해소.

### 7-2. 생존 전략 — 의도적으로 보류 (2026-07-17 결정, 2026-07-18 트리거 도달 후 재확인 — ADR-0064)
vision.md가 던진 성공 질문("완성 후에도 계속 붙잡을 동기가 있는가")과 dogfooding/커뮤니티/포트폴리오의 갈림길은 **기능을 전부 완성한 뒤에 논의하기로 명시적으로 보류**했다. 근거: 완성 전에 이 질문을 붙들면 오히려 병목이 된다. 방향은 "일단 전부 만들고, 유지보수 단계에서 오픈소스화 검토" 쪽으로 잠정 기울어 있으나 **확정하지 않는다.**

> **2026-07-18 재확인([ADR-0064](decisions/0064-survival-strategy-deferral-reaffirmed.md)):** MVP가 npm `0.2.0`(MIT)으로 배포되며 7-2가 정한 "완성 후 재개" 트리거에 사실상 도달했다. 그럼에도 소유자 판단으로 **전략 논의를 계속 보류**한다 — 트리거는 "결정해도 되는 시점"일 뿐 강제가 아니고, MIT/npm 배포 자체가 이미 오픈소스 경로에 반쯤 발을 디딘 것이라 능동적 확산(홍보·커뮤니티)만 미루는 것이므로 되돌릴 게 없다. 단, 2축 검토에서 **메모리 누수 확정(ADR-0013)** 만은 장시간 실사용 관점에서 우선순위가 오르는 유일한 엔진 항목으로 남겨 둔다(전략과 무관한 기술 과제). **→ 2026-07-20 격리 15분 재실행으로 저위험 확인·강등 완료(위 5절 참고).**

- 이 결정의 실무적 함의: 재구현 스코프를 **축소하지 않는다.** P0~P4를 전부 반영하는 것을 기본값으로 했고, 실제로 MVP 코드 단계에서 다섯 개 모두 완료했다(특정 전략에 맞춰 P3·P4를 생략하는 선택지는 열지 않았다).
- 커뮤니티 확산 노력(오픈소스화 여부·홍보 등) 같은 "전략 종속" 작업은 여전히 완성 후 재논의 대상 — 지금 백로그에 넣지 않는다.
- **예외 (2026-07-17 추가):** 배포/설치 UX 중 "연결 방식 + UI 노출 위치"의 **방향성**만은 지금 정했다([ADR-0020](decisions/0020-distribution-entry-ux-direction.md)) — npm CLI 자동 초기화 + 같은 페이지 플로팅 버튼(TanStack Query Devtools 패턴). 이건 전략(오픈소스화할지 말지)과 무관하게, "같은 페이지 안에 있어야 한다"는 게 요소 클릭 연동 같은 향후 기능의 아키텍처 전제조건이라 지금 정하지 않으면 나중에 되돌리기 비쌌기 때문이다. 번들러별(Vite/webpack/Rspack/Turbopack) 기술 검증도 끝났다([ADR-0021](decisions/0021-bundler-injection-feasibility.md), 4개 전부 조건부 GO). **연결 방식 축은 2026-07-18 구현 완료**([ADR-0036](decisions/0036-distribution-connection-implementation.md)) — CLI init + Vite 플러그인 + 조건부 어댑터 + dev 전용 삼중 가드.

### 7-3. 권장 다음 단계 (전략 보류 = 전부 완성 우선)
1. ~~P0(MAX_DEPTH)를 지금 MVP 코드에서 즉시 수정~~ — 완료(ADR-0016), P1~P4도 같은 라운드에서 함께 완료(ADR-0017~0019).
2. **남은 갈림길** (전부 "완성"으로 가는 경로라 7-2 원칙엔 안 어긋남):
   - (a) 2절 "UX 레이어" 표(필터/주석/코드접근/테마) — 지금 위에 얹기. **양방향 DOM 인터랙션은 2026-07-18에 먼저 완료**(아래 참고) — 원래 표에는 없던 항목이지만 ADR-0024 논의 중 발견된 우선순위 높은 기능이었다. **검색 하이라이트+자동 이동, 다크모드+도메인 팔레트도 2026-07-18에 완료**(ADR-0027). **그룹 접기/펼치기, 우클릭 컨텍스트 메뉴, 캔버스 스티키노트까지 같은 날 완료**(ADR-0031). **그룹+개별 동시 필터도 같은 날 완료**(ADR-0033) — 이걸로 원래 표 전부가 끝났다. 코드접근(스키마 확장 필요)과 JSDoc 툴팁(ADR-0007과 충돌)만 명확한 선행 조건이 있어 남아 있다.
   - ~~(b) 검증된 3-레이어 구조를 **정식 재구현**~~ — **완료(2026-07-17).** 테스트 커버리지(vitest 91개) + 패키지 배포 준비(`src/index.ts`, peerDependencies, `build:lib`) + ADR-0002의 열린 결정 확정(bippy, ADR-0022)까지 끝냈다. 세부 내용은 [ADR-0023](decisions/0023-production-hardening-tests-and-package-prep.md) 참고. 아키텍처·스키마는 그대로이므로 "재구현"의 실체는 품질/테스트/배포 준비였다.
   - (c) [ADR-0020](decisions/0020-distribution-entry-ux-direction.md)/[0021](decisions/0021-bundler-injection-feasibility.md)이 정한 방향대로 **배포 진입 경험 구현** — "노출 위치" 축(플로팅 버튼 + 패널)은 **완료**했다(2026-07-18, [ADR-0025](decisions/0025-docked-panel-shell-amendment.md)가 전체화면에서 도킹 패널로 세부 수정). "연결 방식" 축(CLI `init`, 번들러별 자동 주입)도 **완료**했다(2026-07-18, [ADR-0036](decisions/0036-distribution-connection-implementation.md)) — `npx react-render-board init`이 Vite config를 자동 패치하고, `react-render-board/vite` 플러그인이 `transformIndexHtml`로 `react-render-board/inject` 런타임을 앱 소스 무수정으로 주입한다. **Next.js/Turbopack도 `layout.tsx` 자동 패치**(`cli/next.mjs`) — Turbopack엔 플러그인 API가 없고 클라이언트 import는 Next Fast-Refresh 훅 선점에 밀리므로, ADR-0021이 실측한 유일한 승리 경로인 루트 layout `<head>` 동기 `<script>`를 자동 삽입한다(초기 커밋부터 훅 버퍼링 + dev 신호 `__RRB_DEV__` + 플로팅 버튼). **Vite·Turbopack 둘 다 `init` 한 번으로 실제 React Flow 캔버스까지 뜬다** — Next는 `init`이 layout `<head>` 조기 스크립트 + `<body>` `<RenderBoardClient/>` + `RenderBoardClient.tsx` 생성을 자동으로 하고, 그 컴포넌트가 하이드레이션 후 런타임을 로드하면 버퍼된 초기 커밋을 재생해 Next 앱 트리를 캔버스에 그린다(실측 노드 20개). 이걸 뚫는 과정에서 "rolldown이 심는 CJS require 셰임을 Turbopack이 재번들 못 함"을 발견해 lib의 deps(bippy·@xyflow·roughjs)를 external로 빼는 정석 패키징으로 고쳤고, dev 판별을 주입 레이어가 세우는 `__RRB_DEV__` 신호로 통일했다(ADR-0036). **webpack도 원커맨드 실측 완료** — `init`이 config를 `withRenderBoard`로 자동 래핑(`patchWebpackConfig`: 파일 끝에 `module.exports = withRenderBoard(module.exports)`를 덧붙여 흔한 CJS 형태를 안전 래핑, 함수/배열/ESM만 안내 폴백)하고, html-webpack-plugin `beforeEmit`으로 `<head>` 조기 스크립트(Next와 공유) + 런타임 entry의 2단 구조로 실제 캔버스가 뜬다. 즉 **Vite·Turbopack·webpack 세 경로 모두 `npm install`→`init`→`dev` 원커맨드로 실제 React Flow 캔버스까지 Playwright로 실측**됐다. dev 전용 다중 가드(플러그인 `apply:'serve'` + 헬퍼 `mode` + Next `process.env.NODE_ENV` 정적 제외 + 런타임 `__RRB_DEV__`). `verify:init`(Vite)·`verify:init-next`(Turbopack 연결, onCommitFiberRoot 12회)·`verify:init-next-canvas`(Turbopack 원커맨드 end-to-end, 캔버스 20노드)·`verify:init-webpack`(webpack pack→install→withRenderBoard→serve, 캔버스)로 회귀 검증. **npm 배포 준비까지 완료([ADR-0042](decisions/0042-npm-publish-prep-and-mit.md))** — private 해제·`0.1.0`·MIT LICENSE·publishConfig·prepublishOnly(build:lib 게이트)·README 설치 섹션. `npm pack --dry-run`으로 산출물(dist-lib+cli만, src/ 없음, 75.2kB) 확인, 이름 `react-render-board` 사용 가능(npm 404). 실제 `npm publish`는 소유자 계정 로그인이 필요한 되돌리기 어려운 공개 행동이라 소유자가 직접 실행(publish≠소스공개 — files로 dist-lib+cli만 나감). **`0.1.0` 실제 배포 완료(소유자가 2FA로 직접 실행)** — 배포 직후 실측(새 create-next-app 스캐폴드)에서 `peerDependencies`가 과협소해(`^19.2.7`) 실제 최신 Next 프로젝트(`react@19.2.4`)에서 `npm install` 자체가 ERESOLVE로 실패하는 걸 발견, `^18.0.0 || ^19.0.0`으로 완화해 `0.1.1` 재배포. 이어서 **`install`+`init` 두 명령을 `postinstall` 훅으로 하나로 합쳐 `0.2.0` 배포**([ADR-0062](decisions/0062-postinstall-automation.md)) — `cli/init-core.mjs`로 로직을 공유 추출, 자기설치/CI 가드 + install 실패 전파 안 함. npm/yarn은 `npm install` 한 줄로 Vite/Next/webpack 전부 캔버스까지 자동(새 스캐폴드로 `init` 명령 없이 실측 완료). pnpm은 lifecycle 스크립트를 기본 차단하는 표준 정책(`esbuild`/`sharp`도 동일하게 차단됨을 실측 확인 — 패키지 결함 아님, 패키지 쪽에서 우회 불가) 때문에 `pnpm approve-builds --all` 한 단계가 추가로 필요 — README에 패키지 매니저별 절차를 명시했다.

**2026-07-19, 실사용(그리디 홈페이지, Next 16+Turbopack, react-scan 병행) 중 발견된 중대 결함 3건 수정.** 소유자가 실제 프로젝트에 설치해 쓰다가 보드가 완전히 안 뜨는 문제, 그리고 "더블클릭/Alt+클릭이 전부 안 되는데 왜 된다고 했냐"는 정당한 지적을 했다 — 이전까지의 "실측 검증"은 최소 fixture(간단한 카운터 앱)에서만 이뤄졌고, react-scan 같은 실제 서드파티 도구·복잡한 실제 컴포넌트 구조에서는 한 번도 검증되지 않았다는 방법론적 한계가 드러났다:
- **[ADR-0065](decisions/0065-hook-this-binding-bug-fix.md)**: 조기 훅 `inject`가 `this.renderers`에 의존해, react-scan이 `this` 바인딩 없이 체이닝 호출하면 매 커밋마다 크래시(`그룹 확인 중…`에서 멈춤). `this` 비의존으로 수정. **다중 리스너 슬롯으로 react-scan과 완전 공존을 시도했다가 무한 재귀로 실제 페이지가 멈추는 사고를 내고 즉시 폐기·되돌렸다** — 사용자의 실제 프로젝트 파일과 이 저장소의 소스 파일을 따로 되돌리다 소스 쪽을 잠깐 놓칠 뻔한 실수도 있었다(핫픽스와 소스 수정은 항상 같이 다뤄야 한다는 교훈). react-scan과의 완전한 공존은 보류.
- **[ADR-0066](decisions/0066-map-mode-small-tree-threshold.md)**: 지도 모드가 노드 수와 무관하게 순수 줌 배율로만 개별 노드를 숨겨, 43노드짜리 작은 앱도 초기 화면이 통째로 비어 보임. `SMALL_TREE_NODE_THRESHOLD=300` 이하면 지도 모드에서도 항상 디테일 표시하도록 수정.
- **[ADR-0067](decisions/0067-import-meta-env-dead-code-elimination-bug.md)**(가장 중대함): `startDomClickBridge`/`startFiberInspector`가 각자 `import.meta.env.DEV`로 dev 가드를 걸었는데, 이 파일들이 `build:lib`(프로덕션 vite build)을 거치며 그 값이 정적으로 `false`로 굳어 **함수 본체 전체가 트리셰이킹으로 사라져 있었다** — **배포된 모든 버전에서 Alt+클릭 역방향 인터랙션·더블클릭 리빌·hover-follow가 한 번도 동작한 적이 없었다.** `isDevEnvironment()` 공유 유틸(`__RRB_DEV__` 우선 체크)로 통일해 수정, 컴파일된 `dist-lib`에서 로직 생존을 직접 확인하고 실사용 프로젝트에서 Alt+클릭·더블클릭 둘 다 재검증 완료.

**"c8"·"eS" 이름 문제와 역방향 이동 실패 — 0.2.1 이후에도 남았던 것, 2026-07-19 근본 원인 규명·수정 완료([ADR-0068](decisions/0068-next-devtools-root-pollution-fix.md), 선행 조사는 [조사 문서](research/2026-07-18-turbopack-component-name-mangling.md))**: 압축 이름의 정체는 **Next DevTools 오버레이 UI 컴포넌트**(`next/dist/compiled/next-devtools`, 사전 미니파이 — 그래서 두 앱에서 글자까지 동일)였고, 보드가 그걸 그린 이유는 이름/컴파일 문제가 아니라 **root 오염**이었다: Next 16이 자기 개발도구 UI를 별도 React root(`NEXTJS-PORTAL`)로 띄우고 계속 커밋하는데, store가 latest-root-wins(마지막 커밋 root의 트리로 스냅샷 통째 교체)라 보드가 대상 앱 대신 그 트리를 보여줬다. Alt+클릭 역방향 이동이 죽은 것도 같은 원인(앱 fiber id가 보드 트리에 없음) — Vite/webpack에서 멀쩡했던 이유는 그런 도구 root가 없어서고, **SSR과는 무관**. 스파이크 재현 + Next 소스 확인으로 확정하고, 도구 오버레이 root 필터(커스텀 엘리먼트/shadow/`[data-nextjs-dev-overlay]`) + 조기 훅 버퍼 키 수정(rendererID→FiberRoot, renderer당 여러 root 보존) + dev 진단 핸들 `window.__RRB_DEBUG__`를 넣었다. 수정 후 실측: 보드가 앱 트리(온전한 이름 `Root`/`AppRouter`/…)를 그리고 정방향 하이라이트·역방향 Alt+클릭 이동 전부 복구. 같은 라운드에서 **CSS 자기주입 + webpack entry 순서도 수정([ADR-0069](decisions/0069-css-self-injection-and-webpack-entry-order.md))** — 실사용(coverLetter)에서 Vite 플러그인이 JS만 주입해 보드가 스타일 없이 깨지고, webpack은 [앱,런타임] entry 순서로 최초 커밋을 놓치던 결함. 런타임이 CSS를 `?inline` 문자열로 품고 `<style>` 자기주입(로더 구성 무관 — css-loader 없는 webpack 스파이크로 결정적 검증), entry는 [런타임,...앱] prepend, e2e에 computed-style CSS 단언 추가. 배포 상태: ADR-0065~0067 수정은 **`0.2.1`로 소유자가 실제 배포 완료**(2026-07-19). ADR-0068/0069(`0.2.2`)에 이어 **ADR-0070까지 담아 `0.2.3`으로 범프 완료, `npm publish`만 소유자 2FA 실행 대기** — typecheck·vitest 342개·Vite/webpack/Next e2e(확장 선점·CSS 단언 포함) 전부 통과.

**ADR-0070 — DevTools 확장 훅 선점 + stale 스크립트(2026-07-19, 실사용자가 근본 원인 규명·로컬 검증 후 제보).** 0.2.2 설치 후에도 그리디에서 보드가 "0/0 노드"로 비던 진짜 원인: **브라우저 React DevTools/React Scan 확장이 `document_start`에 `__REACT_DEVTOOLS_GLOBAL_HOOK__`을 선점**해, 조기 `<head>` 스크립트의 `if(!hook)` 분기가 죽어 rrb 버퍼링이 아예 안 걸렸다(ADR-0068 root 오염과 별개 — 0068은 "엉뚱한 트리", 0070은 "아무 트리도 못 잡음"). Next는 하이드레이션 커밋이 런타임 부팅보다 먼저라 버퍼가 필수인데 그게 확장에 막혔고, 정적 화면이라 이후 커밋도 없어 영구 0/0. **수정**: 기존 훅의 `onCommitFiberRoot`를 원본 보존하며 한 번만 재할당(monkey-patch, `__rrbPatched__` 가드 — ADR-0065의 get/set 디스패처 무한재귀와 달리 안전, 확장 원본을 이어 호출해 Components 패널 공존). 별도로 조기 스크립트가 layout.tsx에 박제돼 업데이트가 안 흘러들던 문제(사용자가 "layout 사본만 구버전"으로 관측)도 수정 — 마커에 내용 해시(`data-rrb-inject="<hash>"`)를 박아 postinstall이 구버전 블록만 자동 갱신하므로 **재설치만으로 이번 수정이 전파**된다. react-scan `<script>` 태그 단독은 무죄로 확인(확장 레벨 경합이 원인). `verify:init-next-canvas`에 확장 선점 케이스(Playwright `addInitScript`) 추가로 실측.

**ADR-0071 — `groupHint` 해석 배치 hang 타임아웃(2026-07-19, react-render-board를 다른 프로젝트에 설치해 쓴 세션이 제보).** 또 다른 실사용 리포트: Next+Turbopack 프로젝트에서 렌더 트리 캡처는 정확한데(콘솔 에러 0건) 앱 컴포넌트 77개 전부가 "(그룹 확인 중…)"에 25초+ 영구히 갇혔다. 리포트는 Turbopack owner-stack 파싱 실패로 추정했으나, 실제 원인은 **번들러 무관 아키텍처 결함**이었다: `resolveGroupHints`(`src/data/sourceHints.ts`)가 배치 안 모든 fiber의 `getSource` 호출을 하나의 `Promise.all`로 묶는데, `getSource` 내부 sourcemap fetch가 reject 없이 응답 없는 채로 hang하면 catch가 안 걸리고 **배치 전체**가 영원히 안 풀린다(초기 커밋엔 앱 전체가 한 배치). 개별 `getSource` 호출에 5초 타임아웃(`Promise.race`)을 추가해 hang한 항목만 기존 null 폴백(파일 그룹핑)을 타도록 수정. Turbopack에서 sourcemap fetch가 왜 무응답이었는지 근본 원인은 미규명(재현 fixture 없음, blocker 아님). 세부 내용은 [ADR-0071](decisions/0071-group-hint-batch-hang-timeout.md) 참고. **`0.2.4`로 범프 완료, `npm publish`만 소유자 2FA 실행 대기.**
   - ~~보드 ↔ 실제 DOM 양방향 인터랙션~~ — **완료(2026-07-18).** 정방향(노드 클릭→DOM 하이라이트)·역방향(Alt+클릭/픽 모드→보드 이동) 전부 구현. 구현 중 셸 충돌(전체화면→도킹 패널, ADR-0025)과 역방향 트리거 범위(모든 클릭→Alt+클릭/픽 모드로 축소) 두 가지 실측 결함을 발견해 그 자리에서 고쳤다. 세부 내용은 [ADR-0026](decisions/0026-bidirectional-interaction-implementation.md) 참고.
   - ~~검색 하이라이트+자동 이동, 다크모드+도메인 팔레트~~ — **완료(2026-07-18).** 구현 중 다른 세션의 병행 편집(rough.js 손그림 테두리)을 발견해 검색 강조/팔레트 표현 방식을 재설계했고, 역방향 인터랙션이 접힌 그룹 안 노드를 못 가리키던 gap도 함께 발견해 고쳤다. 세부 내용은 [ADR-0027](decisions/0027-search-and-theme-ux-round.md) 참고.

**ADR-0072 — 배포 매트릭스 검증(2026-07-20).** ADR-0067~0071로 스택별(주로 Next+Turbopack) 실사용 결함이 반복되자, "여러 번들러를 한 레포에서 자동 검증"하는 방안을 논의. 전 축(번들러×패키지매니저×React버전) 곱 대신 **번들러/프레임워크만 진짜 축**(주입 지점이 실제로 다름)으로 분해하고 패키지매니저는 엣지케이스로, 기능은 스택 불변이라 매트릭스에서 제외했다. `npm run verify:matrix`(`scripts/verify-matrix.mjs`)가 `verify-init.mjs`(Vite)·`verify-init-webpack.mjs`·`verify-init-rspack.mjs`(Rspack, 신규 — beforeEmit 조기 스크립트가 Rspack webpack 호환 레이어에서 실제 런타임으로 동작함을 첫 실측)·`verify-init-next-canvas.mjs`(Next/Turbopack) 4개를 새 어서션 없이 순회하며 pass/fail 표 + 스크린샷(`verify-output/matrix/`)만 남긴다. 실측 4개 전부 PASS. 주기적 스케줄러(사용자가 검토한 OCI 서버 등)는 "우리가 안 건드렸는데 저절로 깨진" 재발 증거가 없어 기각 — publish 직전 1회 수동 실행. pnpm strict·yarn Berry 엣지케이스는 의도적 미구현(증거 생기면 추가). 세부 내용은 [ADR-0072](decisions/0072-distribution-matrix-verification.md) 참고.
3. (선택) ~~메모리 누수 격리 재실행~~(✅ 2026-07-20 완료·저위험 강등, ADR-0013), groupHint 해석 급락 원인 규명 등 "조사 필요" 항목은 위 2번과 병행하거나 뒤로 미룬다.
4. **기능 완성 후에야** 7-2의 생존 전략(오픈소스화 여부·방식)을 다시 연다.

---

## 관련 문서
- 비전·성공 기준: [`vision.md`](vision.md)
- 아키텍처·설계 원칙: [`architecture.md`](architecture.md)
- 로드맵·판단 지점: [`roadmap.md`](roadmap.md)
- UI 철학: [`ui-philosophy.md`](ui-philosophy.md)
- 전체 의사결정 기록: [`decisions/`](decisions/) (ADR-0001~0072)
- 선행 프로젝트 조사: [`research/prior-art.md`](research/prior-art.md)(요약) · [`research/2026-07-17-prior-art-survey.md`](research/2026-07-17-prior-art-survey.md) · [`research/2026-07-17-prior-art-causes-and-legacy.md`](research/2026-07-17-prior-art-causes-and-legacy.md)
- 기술 옵션 조사(훅킹·시각화 레이어 후보): [`research/technical-options.md`](research/technical-options.md)
- React Flow UX 확장 가능 범위 조사(미구현): [`research/2026-07-17-react-flow-ux-capabilities.md`](research/2026-07-17-react-flow-ux-capabilities.md)
- 간선 직교/버스 배선 + 클러터 조사(배선 보류, ADR-0029): [`research/2026-07-18-orthogonal-edge-routing.md`](research/2026-07-18-orthogonal-edge-routing.md)
