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
| [0020](0020-distribution-entry-ux-direction.md) | 배포/설치 UX 방향 — npm 자동 설정 + 같은 페이지 플로팅 버튼 | 채택됨(노출 위치를 도킹 패널로 수정, ADR-0025) |
| [0021](0021-bundler-injection-feasibility.md) | 번들러 무관 자동 계측 스크립트 주입 기술 가능성 검증 (Vite/webpack/Rspack/Turbopack) | 채택됨 |
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
| [0032](0032-props-flow-and-change-afterglow.md) | props 흐름 추적 + 변경 잔상(afterglow) — 데이터 스코프 확장 1단계(Context/Zustand는 보류) | 채택됨(방향성, 구현 다음 라운드) |
| [0033](0033-group-and-individual-filter.md) | 그룹+개별 동시 필터 — 검색을 "강조"에서 "숨김"으로 확장 | 채택됨 |
