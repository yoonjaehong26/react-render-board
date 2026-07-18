# 의사결정 기록 (ADR)

이 폴더는 프로젝트의 주요 결정을 **ADR(Architecture Decision Record)** 형식으로 기록한다. 파일 하나당 결정 하나. "왜 이렇게 결정했는지"를 남겨, 나중에 코드를 다시 짜더라도 판단 근거는 잃지 않게 한다.

새 결정은 [`0000-template.md`](0000-template.md)를 복사해 작성한다.

## 목록

| # | 제목 | 상태 |
|---|---|---|
| [0001](0001-react-only-scope.md) | 범위를 React 전용으로 한정 | 채택됨 |
| [0002](0002-hooking-layer.md) | 훅킹 레이어를 직접 구현하지 않고 위임 | 채택됨(bippy로 확정, ADR-0022) |
| [0003](0003-project-name.md) | 프로젝트 이름 `react-render-board` | 채택됨 |
| [0004](0004-docs-in-repo.md) | 문서를 GitHub 레포의 `.md`로 관리 | 채택됨 |
| [0005](0005-exp1-fiber-extraction-feasibility.md) | 실험 1 — bippy로 Fiber 트리 추출 기술 가능성 검증 | 채택됨 |
| [0006](0006-exp2-flow-prototype-ui-validation.md) | 실험 2 — React Flow 클러스터링 + semantic zoom UI 철학 검증 | 채택됨 |
| [0007](0007-grouping-hint-feasibility.md) | 그룹핑 힌트(소스 파일 경로) 실현 가능성 검증 | 채택됨 |
| [0008](0008-live-mvp-integration.md) | 라이브 MVP — 실험 1 + 2 + 그룹핑 힌트 검증 통합 | 채택됨 |
| [0009](0009-real-app-validation.md) | 판단 지점 — 실제 제3자 오픈소스 앱(excalidraw) 검증 | 채택됨 |
| [0010](0010-legacy-and-concurrent-compatibility.md) | class 컴포넌트/에러 바운더리/concurrent 기능(useTransition, Suspense) 호환성 검증 | 채택됨 |
| [0011](0011-lazy-suspense-code-splitting.md) | React.lazy + Suspense(코드 스플리팅 경계) 호환성 검증 | 채택됨 |
| [0012](0012-grouping-noise-and-layout-perf-fix.md) | 그룹핑 노이즈 흡수 + 레이아웃 재계산 성능 최적화(MVP 1순위 백로그) | 채택됨 |
| [0013](0013-high-frequency-render-stress-test.md) | 고빈도 렌더 갱신 스트레스 테스트 — 디바운스 전략의 지속 부하 한계 | 채택됨 |
| [0014](0014-thousands-of-components-stress-test.md) | 추가 스트레스 테스트 — 대규모(수천 개) 컴포넌트 | 채택됨 |
| [0015](0015-routing-transition-validation.md) | 판단 지점 — 라우팅 기반 대형 서브트리 전환 + 라우트 단위 코드 스플리팅 실제 앱 검증(berry-admin) | 채택됨 |
| [0016](0016-max-depth-sibling-counting-fix.md) | P0 — `MAX_DEPTH` 형제-카운팅 버그 수정 (`serialize.ts`) | 채택됨 |
| [0017](0017-viewport-based-partial-recompute.md) | P1 — Canvas 파이프라인의 뷰포트 기반 부분 재계산 | 채택됨 |
| [0018](0018-map-mode-lod-and-camera-refit.md) | P2 — 지도 모드 LOD(minZoom·라벨 역-스케일) + P3 — 카메라 자동 refit·`groupOrder` pruning | 채택됨 |
| [0019](0019-library-hint-whitelist-inversion.md) | P4 — 그룹핑 노이즈 판별 커버리지 (화이트리스트 반전) | 채택됨 |
| [0020](0020-distribution-entry-ux-direction.md) | 배포/설치 UX 방향 — npm 자동 설정 + 같은 페이지 플로팅 버튼 | 채택됨(노출 위치를 도킹 패널로 수정, ADR-0025 / 연결 방식 구현 ADR-0036) |
| [0021](0021-bundler-injection-feasibility.md) | 번들러 무관 자동 계측 스크립트 주입 기술 가능성 검증 (Vite/webpack/Rspack/Turbopack) | 채택됨(구현 ADR-0036) |
| [0022](0022-hooking-library-confirmed-bippy.md) | 훅킹 라이브러리 확정 — bippy 유지, react-devtools-core 도입 보류 | 채택됨 |
| [0023](0023-production-hardening-tests-and-package-prep.md) | 정식 재구현 1라운드 — 테스트 커버리지(vitest, 91개) + 패키지 배포 준비 | 채택됨 |
| [0024](0024-board-dom-bidirectional-interaction.md) | 보드 ↔ 실제 DOM 양방향 인터랙션 + MVP 데이터 스코프 경계 | 채택됨(구현 완료, ADR-0026) |
| [0025](0025-docked-panel-shell-amendment.md) | 배포 셸 수정 — 전체화면 오버레이 → 도킹 패널 | 채택됨 |
| [0026](0026-bidirectional-interaction-implementation.md) | 보드 ↔ 실제 DOM 양방향 인터랙션 구현 | 채택됨 |
| [0027](0027-search-and-theme-ux-round.md) | UX 레이어 2라운드 — 검색 하이라이트+자동 이동, 다크모드+도메인 팔레트 | 채택됨 |
| [0028](0028-shape-vocabulary-for-node-roles.md) | 노드 도형 어휘 — "역할"을 도형으로(라우트 6각형/경계/포탈), "구현 방식"은 색·질감으로 | 채택됨(방향성, 구현 다음 라운드) |
| [0029](0029-orthogonal-edge-routing-deferred.md) | 간선 직교/버스 배선 보류, 클러터 감쇠를 먼저 — 진행 시 제1후보는 규칙 기반 배선기(libavoid 폴백) | 채택됨(방향성 — 배선 보류, 조사만) |
| [0030](0030-excalidraw-hand-drawn-visual-identity.md) | Excalidraw풍 손그림 시각 정체성 — 역할별 rough 세기(노드=스케치/크롬=볼펜/강조=마커·햇칭), 손글씨는 워드마크에만 | 채택됨(방향성, 일부 구현) |
| [0031](0031-collapse-context-menu-sticky-notes.md) | UX 레이어 3라운드 — 그룹 접기/펼치기, 우클릭 컨텍스트 메뉴, 캔버스 스티키노트 | 채택됨 |
| [0032](0032-props-flow-and-change-afterglow.md) | props 흐름 추적 + 변경 잔상(afterglow) — 데이터 스코프 확장 1단계(Context/Zustand는 보류). 참조 추적은 간선 경로로 표시 | 채택됨(구현) |
| [0033](0033-group-and-individual-filter.md) | 그룹+개별 동시 필터 — 검색을 "강조"에서 "숨김"으로 확장 | 채택됨 |
| [0034](0034-group-level-waterfall-layout.md) | 그룹 간 배치 — 단일 행-패킹 → 부모 깊이 기반 waterfall(층 배치, 공유 그룹은 최장 경로 층에 1회) + 지도 모드 그룹↔그룹 집계 엣지 | 채택됨(ADR-0008 그룹 간 배치 수정) |
| [0035](0035-shape-and-hand-drawn-implementation.md) | 시각 언어 1라운드 구현 — 라우트 6각형 + 손그림 다크/강조/볼펜 크롬/워드마크(포탈·경계는 실측 후 보류) | 채택됨(구현) |
| [0036](0036-distribution-connection-implementation.md) | 배포/설치 "연결 방식" 구현 — Vite·Turbopack·webpack **세 경로 모두 `init` 원커맨드로 실제 캔버스까지 Playwright 실측**(Vite=plugins 배열, Next=layout+client, webpack=config 자동 래핑). deps external 패키징으로 rolldown require-셰임 우회, 조기 `<head>` 스크립트+버퍼 재생, dev 전용 가드(`__RRB_DEV__`) | 채택됨(구현) |
| [0037](0037-circular-floating-button-with-pick-satellite.md) | 플로팅 버튼 형태 — 알약 2개 → 원형 FAB(트리 글리프, hover 시 워드마크 펼침) + 픽 위성(요소 선택), rough 크롬 원형 확장(`CHROME_CIRCLE`), aria-label 유지 | 채택됨(구현) |
| [0038](0038-pick-mode-hover-follow-preview.md) | 픽 모드 hover-follow 프리뷰 — 마우스 따라 커서 아래 요소를 실시간 강조(CSS 테두리+헷칭, 크기 무관·rAF 스로틀·픽 모드일 때만 리스너) | 채택됨(구현) |
| [0039](0039-lod-edge-prop-labels.md) | 간선 위 props 라벨 — LOD 조건부 상시 표시(상세 모드·props ≤ N·국소 클러터 낮을 때만). 정밀 클릭 추적(ADR-0032)과 상보 | 채택됨(방향성 — ADR-0029 클러터/배선 라운드에 구현) |
| [0040](0040-resizable-dockable-panel.md) | 도킹 패널 크기 조절 + 위치 전환(하단/좌/우 사이드바) — 드래그 리사이즈, 화면 비율 저장, **오버레이 전용(앱 CSS 안 건드림)**, 도킹 컨트롤 상단 모서리 | 채택됨(구현, ADR-0025 스코프 확장) |
| [0041](0041-edge-clutter-attenuation.md) | 간선 클러터 감쇠 구현 — 시각적 감쇠(그룹 내 간선 hairline + 그룹 내 깊이별 opacity, 그룹 간은 현행 유지) + 단계형 LOD(이진 → 3단, 중간 줌은 구조 간선만·깊은 detail 간선은 줌인 시 페이드인). 배선 없이 표현 레이어만, 깊이는 그룹 경계에서 리셋(라이브 안정성 상속). ADR-0029 결정 #4 구현 | 채택됨(구현) |
| [0042](0042-npm-publish-prep-and-mit.md) | npm 공개 배포 준비 + MIT 라이선스 — private 해제·`0.1.0`·publishConfig·prepublishOnly·LICENSE·README 설치 섹션. publish≠소스공개(files로 dist-lib+cli만), 이름 사용 가능. 실제 publish는 소유자 계정으로 | 채택됨(준비 완료, 업로드는 소유자) |
| [0043](0043-double-click-reveal-in-real-page.md) | 보드 노드 더블클릭 → 실제 화면으로 스크롤 이동 + 하이라이트(라우터는 안 건드림 — 노드=현재 라우트). 클릭 타이밍으로 더블클릭 감지(네이티브 dblclick은 리렌더로 깨짐) | 채택됨(구현) |
| [0044](0044-hover-lineage-highlight.md) | hover 혈통 점등 — 간선 클러터 감쇠 c(on-demand). 노드 hover 시 조상 체인+자손 서브트리 간선만 **굵게(width 3)+부모 도메인 색(선 정체성)** 으로 강하게 점등, 나머지는 거의 지움(0.04). 간선만 대상(flowNodes 불변), 검색 dimming 재사용, 점등은 깊이감쇠·LOD 무시. hover=구조 혈통 / 클릭=데이터 흐름(ADR-0032) 상보 | 채택됨(구현, "부모색 hover 한정"은 ADR-0047이 상시로 뒤집음) |
| [0045](0045-multi-props-flow-parent-colored-edges.md) | 다중 props 흐름 + 간선 색=출발(부모) 노드 — 추적을 단일→리스트로, 각 흐름은 부모 파생 색(구조 배선과 공유). 겹침은 배선 전 "한 색/번갈아", 완성형(평행 색 줄기)은 배선 필요. ADR-0044(hover 부모색)의 색 언어를 데이터 흐름 상시 추적으로 확장 | 채택됨(방향성 — 완성형은 배선 라운드와 공동) |
| [0046](0046-list-coalescing.md) | 리스트 접기 — 같은 부모 밑 같은 종류 형제 N개(≥5)를 대표 하나 + "×N" 배지로. 시각화 레이어에서만(데이터/인터랙션 불변), 대표=최소 id(재정렬에도 안정). downfall barycenter 안정성 토대(레이아웃 안정성 라운드 1/3) | 채택됨(구현) |
| [0047](0047-always-on-parent-colored-edges.md) | 간선 색=부모 도메인, **상시** 적용 (ADR-0044 "hover에서만" 뒤집음). 세 채널 직교: opacity=깊이 감쇠 / hue=부모 도메인 색 / 선 스타일=그룹 내 실선·경계 점선. 크로스-그룹 주황 단색 폐지(경계는 점선, 색은 출처 도메인). 같은-그룹은 부모가 그 그룹 안이라 그룹당 단색→haze 아님. 감쇠는 그대로(색은 hue 채널). 라이트/다크 실측 | 채택됨(구현) |
| [0048](0048-cross-group-edge-frame-fallback.md) | 크로스-그룹 간선 프레임 폴백 (버그 수정) — "wide view엔 보이다 확대하면 사라지던" 연결. 부모 노드가 뷰포트 컬링되면 간선을 버리지 않고 부모 그룹 프레임으로 잇는다(edge-cross-group-frame). 크로스-그룹에만, 프레임은 항상 렌더라 성능 불변. 실측 14→0 소멸 → 14→6 유지 | 채택됨(구현) |
| [0049](0049-wide-view-detail-toggle.md) | "지도에서도 상세" 토글 — 줌아웃해도 화면 안 그룹은 내부 컴포넌트 표시("축소하면 보던 게 사라짐" 해소). 뷰포트 컬링 유지라 성능 안전(ADR-0017), 지도 모드 강제 접힘만 예외 | 채택됨(구현) |
| [0050](0050-render-throttle-and-stable-nodes.md) | 고빈도 흰 깜빡임 수정 — store notify를 최소 간격 스로틀(~30Hz 캡, requestIdleCallback은 "최소 간격" 미보장) + 안 바뀐 노드는 객체 참조 재사용(React Flow 재렌더/SVG 재래스터 건너뜀). 실측 ComponentNode 425→120회/노드/초 | 채택됨(구현) |
| [0051](0051-rule-based-cross-group-edge-routing.md) | 크로스-그룹 간선 규칙 기반 직교 배선 (ADR-0029 §5 착수) — 그룹 내 버스는 smoothstep이 이미 정렬(중점 채널 공유)이라 크로스-그룹만 커스텀 `ortho`로. 그룹 프레임을 장애물로 **Hanan-그리드 A***(굽힘 페널티+memoize)로 완전 회피 배선, 좌표 순수함수라 라이브 안정성 상속(libavoid/WASM 불필요). 실측 외부 프레임 관통 0, 벽 사이 통로도 통과(유닛). v3(명시적 버스 획 병합·대규모 실측)는 남김 | 채택됨(구현 v2) |
| [0052](0052-props-panel-drag-resize.md) | props 패널 드래그 이동 + 크기 조절 — "모달이 화면을 많이 가림 + props 많아질 것" 대응. 도킹(ADR-0040) 대신 자유 배치: 헤더 드래그로 이동, 좌하단 핸들로 폭·높이, `.canvas` 기준 좌표/크기를 localStorage 영속(clamp로 화면 밖 방지). Canvas 불변(전부 PropsPanel 안). 실측 이동·리사이즈·새로고침 복원 | 채택됨(구현) |
