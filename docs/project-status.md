# 프로젝트 현황 종합 (Project Status)

> 이 문서는 지금까지의 모든 조사·실험·검증을 한 곳에 체계화한 **살아있는 스냅샷**이다. 세부 근거는 각 [`decisions/`](decisions/) ADR에 있고, 여기서는 "지금 우리가 어디 있고, 무엇이 확실하며, 무엇이 남았는가"만 요약한다.
>
> - 최종 갱신: 2026-07-17
> - 현재 단계: **판단 지점 통과 + 백로그 5건(P0~P4) 해소 완료 + 정식 재구현 1라운드(테스트 커버리지·배포 준비·훅킹 라이브러리 확정) 완료 → 엔진은 완성이자 코드 품질도 라이브러리 수준. UX 레이어(필터/주석/코드접근/테마)는 조사만 되고 미구현 → 다음 경로 미결정(7-3)**
> - 엔진(훅킹→데이터→시각화)은 vitest 유닛 테스트 91개 + 기존 Playwright 통합 검증으로 뒷받침되고, `src/index.ts` 공개 API·라이브러리 빌드(`npm run build:lib`)까지 준비됐다(ADR-0023). 다만 실행 경험 자체(`npm run dev`)는 그대로다 — 계측 대상 데모 앱 + 실시간 보드가 뜨고(2절 참고), 사용자가 조작할 편의 기능(필터/주석/코드접근/테마)은 여전히 없다.

---

## 1. 한눈에 보기

| 질문 | 답 | 근거 |
|---|---|---|
| 기술적으로 되는가? | **된다** (실시간 Fiber 훅킹 → 데이터 정규화 → 캔버스 시각화가 실제 앱에서 동작) | ADR-0005·0008·0009 |
| UI 철학이 통하는가? | **통한다** (영역 그룹핑 + semantic zoom이 실제 앱에서도 읽힘) | ADR-0006·0009 |
| 실제 제3자 앱에서 버티는가? | **소~중 규모(수백 개)는 통과.** 대규모(수천 개)는 명확한 한계 확인 | ADR-0009·0014·0015 |
| 다양한 React 패턴을 커버하는가? | **커버한다** (class/에러바운더리/concurrent/lazy+Suspense/라우팅/포털 전부 통과) | ADR-0010·0011·0015 |
| 지금 정식 재구현을 시작해도 되는가? | **된다.** 아래 "확인된 결함" 5건(P0~P4)을 이번 라운드에서 전부 해소했다 | ADR-0012~0019 |
| 지금 실제로 "쓸 수 있는 도구"인가? | **아직 아니다.** 엔진(훅킹→데이터→기본 시각화)은 완성·검증됐지만, 필터/주석/코드접근/테마 같은 사용자 편의 기능은 하나도 없다 | 아래 2절 |
| 장기 생존이 보장되는가? | **전략 논의 의도적 보류** — 기능 완성 후 재개(7-2). 지금은 "전부 완성"이 기본값 | vision.md, 7-2 |

**한 줄 요약:** 기술·철학·호환성은 실제 앱에서 검증 완료. 대규모 성능/시각화에 있던 구체적 결함 5건(전부 시각화·직렬화 레이어의 국소적 문제, 데이터 스키마 같은 근본 결함 아님)도 이번 라운드에서 전부 해소했다(ADR-0016~0019). 다만 이건 "엔진"이 완성됐다는 뜻이지 "제품"이 완성됐다는 뜻은 아니다 — 사용자가 만질 편의 기능은 조사만 됐고 구현은 안 됐다(2절). 생존 전략은 완성 후로 미뤄뒀으니, 지금 할 일은 이 엔진 위에 실제 기능을 얹는 것이다.

---

## 2. 지금 구현된 기능 (실행하면 뭐가 보이는가)

`npm run dev`로 실행하면 좌우 분할 화면이 뜬다. 왼쪽은 계측 대상 데모 앱, 오른쪽은 그 앱의 렌더 트리를 실시간으로 보여주는 보드 — 이게 이 프로젝트의 실제 결과물이다.

### 🟢 엔진 — 완성, 실제 앱 3개(excalidraw·berry-admin·shadcn-admin)로 검증됨

| 레이어 | 파일 | 하는 일 |
|---|---|---|
| 훅킹 | `src/hooking/fiberInspector.ts` | bippy로 커밋마다 Fiber 트리 접근 |
| 데이터 | `src/data/{serialize,sourceHints,store,types}.ts` | Fiber → 정규화 노드, groupHint 비동기 해석, 구독 가능한 store |
| 시각화 | `src/visualization/` | React Flow 기반 그룹 프레임+노드, 그룹 경계 횡단 엣지, semantic zoom(지도↔상세), host 노드 기본 숨김 |

보드에서 실제로 되는 것: 실시간 렌더 트리 관찰, 도메인별 그룹 프레임, 줌아웃 시 지도 모드/줌인 시 상세 모드 전환, host 노드 토글, 수천 개 노드까지 안 뭉개짐(P0~P4 반영 후).

### ⚪ 왼쪽 "계측 대상 앱"에 있는 테스트용 컴포넌트 (`src/fixtures/`)

검증 라운드마다 하나씩 쌓인 것 — 제품 기능이 아니라 이 도구 자체를 테스트하기 위한 fixture:

- `domains/shell`, `domains/checkout` — 기본 도메인 구조 (그룹핑 확인용)
- 알림 패널 토글 버튼 (`domains/notifications`) — 컴포넌트 통째 마운트/언마운트 재현
- `domains/advanced` — class 컴포넌트, 에러 바운더리, `useTransition`, Suspense 데이터 페칭
- `domains/reports` — `React.lazy` + Suspense 코드 스플리팅
- `domains/livefeed` — 10~240Hz 고빈도 갱신 버튼
- `domains/stress` (`?stressCount=` 쿼리로만 켜짐) — 수천 개 컴포넌트 스트레스

### 🔴 UX 레이어 — 조사만 완료, 구현은 0건

[`docs/research/2026-07-17-react-flow-ux-capabilities.md`](research/2026-07-17-react-flow-ux-capabilities.md)에 "가능하다"는 조사 결과만 있고 코드는 아직 없다:

| 기능 | 상태 |
|---|---|
| 즉각 검색/필터링 | 미구현 — React Flow API로 간단히 가능하다고 조사됨(그룹 `hidden` 전파는 직접 구현 필요) |
| 캔버스 주석(스티키노트) | 미구현 — 공식 `AnnotationNode` 예제로 커버 가능하다고 조사됨 |
| 컴포넌트 코드로 점프 | 미구현 — 현재 `lineNumber`/`columnNumber` 자체를 데이터 레이어에서 버리고 있어(`sourceHints.ts`), 스키마 확장이 선행 조건 |
| 다크모드/테마 변경 | 미구현 — React Flow `colorMode` prop은 있으나 커스텀 노드(`ComponentNode`/`GroupNode`)엔 자동 적용 안 됨 |
| 그룹 접기/펼치기 | 미구현 |
| 코드 주석(JSDoc) 표시 | 조사 결과 **근본적 제약 발견** — `getSource`가 "사용 위치"만 주는 설계(ADR-0007)와 정면 충돌해 별도 리서치 필요 |

**요약: 엔진은 완성·검증됐지만, 사람이 실제로 쓸 만한 도구가 되려면 이 표를 하나씩 구현해야 한다.**

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
| 배포/진입 UX 방향 | 연결 방식(CLI 자동 초기화) + 노출 위치(같은 페이지 플로팅 버튼+포탈) 결정, 4개 번들러 기술 검증 | 방향 확정(구현 0%). npm+CLI init + TanStack Query식 오버레이. Vite/webpack/Rspack/Turbopack 전부 조건부 GO | [0020](decisions/0020-distribution-entry-ux-direction.md)·[0021](decisions/0021-bundler-injection-feasibility.md) |

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
- **메모리 누수 여부 미확정** — 60Hz 200초에서 강제 GC 후에도 힙 +10MB. 격리 환경 15분+ 재실행 필요(ADR-0013).
- **대형 라우트에서 groupHint 해석 급락** — dashboard(1716노드)가 login(288)보다 그룹이 훨씬 심하게 뭉침. `getSource` 동시성-해석 성공률 상관 조사 필요(ADR-0015).
- **인터랙션 배율 = f(노드 수 × 커밋 횟수)** — 배율이 노드 수만의 함수가 아님. 정확한 관계식 미규명(ADR-0014).

---

## 6. 3-레이어별 건강 상태

| 레이어 | 상태 | 요약 |
|---|---|---|
| **1. 훅킹/백엔드** | 🟢 견고 | 실제 앱 3개에서 크래시 0. 남은 결함 없음. **라이브러리 확정됨(bippy, ADR-0022)**. bippy API 드리프트만 주의(버전업 시 `.d.ts` 직접 확인 규칙 — ADR-0002). 유닛 테스트 5개(`fiberInspector.test.ts`) |
| **2. 데이터** | 🟢 견고 | 정합성·호환성 완벽. **P0 MAX_DEPTH 버그 해소됨**(ADR-0016). 유닛 테스트 21개(`serialize`·`sourceHints`·`store`) |
| **3. 시각화** | 🟢 견고, 대규모까지 검증됨 | 소~중 규모는 물론 대규모(9,000+ 노드, 74개 그룹)에서도 응답성·지도 모드·카메라 추적·그룹 품질 전부 확인. **P1~P4 결함 4건 해소됨**(ADR-0017~0019). 유닛 테스트 65개(`lib/*` 38개 + 컴포넌트 27개) |

레이어별 유닛 테스트(총 91개, vitest) + 기존 Playwright 통합 검증(`scripts/verify*.mjs`)의 역할 분리와 세부 내용은 [ADR-0023](decisions/0023-production-hardening-tests-and-package-prep.md) 참고. `npm run test`로 실행한다.

---

## 7. 앞으로의 방향성

### 7-1. 정식 재구현 착수 전 반영해야 했던 것 — 2026-07-17 전부 해소 완료
roadmap.md의 "대규모 스케일은 처음부터 설계에 반영" 원칙이 이번 스트레스 테스트로 구체적 숫자와 함께 확인됐다. MVP 코드 단계에서 아래 5가지를 전부 고쳤으므로(순서: P0→P1→P2+P3→P4, 의존관계를 따름), 정식 재구현은 "지금 검증된 이 형태"를 그대로 이어받으면 된다:

1. **직렬화 순회의 depth/형제 카운터 분리** (P0, [ADR-0016](decisions/0016-max-depth-sibling-counting-fix.md)) — ✅ 해소.
2. **Canvas의 뷰포트 기반 부분 재계산** (P1, [ADR-0017](decisions/0017-viewport-based-partial-recompute.md)) — ✅ 해소. "접기/펼치기·검색·부분 렌더링"(roadmap 원안)이 여기 묶였다.
3. **지도 모드의 LOD 렌더링** (P2, [ADR-0018](decisions/0018-map-mode-lod-and-camera-refit.md)) — ✅ 해소(라벨 declutter는 부분 완화, 후속 과제로 남음).
4. **카메라 정책 + `groupOrder` 생명주기** (P3, [ADR-0018](decisions/0018-map-mode-lod-and-camera-refit.md)) — ✅ 해소.
5. **라이브러리 경로 판별의 화이트리스트 반전** (P4, [ADR-0019](decisions/0019-library-hint-whitelist-inversion.md)) — ✅ 해소.

### 7-2. 생존 전략 — 의도적으로 보류 (2026-07-17 결정)
vision.md가 던진 성공 질문("완성 후에도 계속 붙잡을 동기가 있는가")과 dogfooding/커뮤니티/포트폴리오의 갈림길은 **기능을 전부 완성한 뒤에 논의하기로 명시적으로 보류**했다. 근거: 완성 전에 이 질문을 붙들면 오히려 병목이 된다. 방향은 "일단 전부 만들고, 유지보수 단계에서 오픈소스화 검토" 쪽으로 잠정 기울어 있으나 **확정하지 않는다.**

- 이 결정의 실무적 함의: 재구현 스코프를 **축소하지 않는다.** P0~P4를 전부 반영하는 것을 기본값으로 했고, 실제로 MVP 코드 단계에서 다섯 개 모두 완료했다(특정 전략에 맞춰 P3·P4를 생략하는 선택지는 열지 않았다).
- 커뮤니티 확산 노력(오픈소스화 여부·홍보 등) 같은 "전략 종속" 작업은 여전히 완성 후 재논의 대상 — 지금 백로그에 넣지 않는다.
- **예외 (2026-07-17 추가):** 배포/설치 UX 중 "연결 방식 + UI 노출 위치"의 **방향성**만은 지금 정했다([ADR-0020](decisions/0020-distribution-entry-ux-direction.md)) — npm CLI 자동 초기화 + 같은 페이지 플로팅 버튼(TanStack Query Devtools 패턴). 이건 전략(오픈소스화할지 말지)과 무관하게, "같은 페이지 안에 있어야 한다"는 게 요소 클릭 연동 같은 향후 기능의 아키텍처 전제조건이라 지금 정하지 않으면 나중에 되돌리기 비쌌기 때문이다. 번들러별(Vite/webpack/Rspack/Turbopack) 기술 검증도 끝났다([ADR-0021](decisions/0021-bundler-injection-feasibility.md), 4개 전부 조건부 GO). **구현 자체는 아직 0%** — 방향만 정해졌다.

### 7-3. 권장 다음 단계 (전략 보류 = 전부 완성 우선)
1. ~~P0(MAX_DEPTH)를 지금 MVP 코드에서 즉시 수정~~ — 완료(ADR-0016), P1~P4도 같은 라운드에서 함께 완료(ADR-0017~0019).
2. **남은 두 갈래 갈림길** (전부 "완성"으로 가는 경로라 7-2 원칙엔 안 어긋남):
   - (a) 2절 "UX 레이어" 표(필터/주석/코드접근/테마) — 지금 MVP 위에 얹기
   - ~~(b) 검증된 3-레이어 구조를 **정식 재구현**~~ — **완료(2026-07-17).** 테스트 커버리지(vitest 91개) + 패키지 배포 준비(`src/index.ts`, peerDependencies, `build:lib`) + ADR-0002의 열린 결정 확정(bippy, ADR-0022)까지 끝냈다. 세부 내용은 [ADR-0023](decisions/0023-production-hardening-tests-and-package-prep.md) 참고. 아키텍처·스키마는 그대로이므로 "재구현"의 실체는 품질/테스트/배포 준비였다.
   - (c) [ADR-0020](decisions/0020-distribution-entry-ux-direction.md)/[0021](decisions/0021-bundler-injection-feasibility.md)이 정한 방향대로 **배포 진입 경험 구현** (CLI `init`, 번들러별 자동 주입, 플로팅 버튼+포탈 오버레이) — 방향만 정해졌고 코드는 없음
3. (선택) 메모리 누수 격리 재실행, groupHint 해석 급락 원인 규명 등 "조사 필요" 항목은 위 2번과 병행하거나 뒤로 미룬다.
4. **기능 완성 후에야** 7-2의 생존 전략(오픈소스화 여부·방식)을 다시 연다.

---

## 관련 문서
- 비전·성공 기준: [`vision.md`](vision.md)
- 아키텍처·설계 원칙: [`architecture.md`](architecture.md)
- 로드맵·판단 지점: [`roadmap.md`](roadmap.md)
- UI 철학: [`ui-philosophy.md`](ui-philosophy.md)
- 전체 의사결정 기록: [`decisions/`](decisions/) (ADR-0001~0023)
- 선행 프로젝트 조사: [`research/prior-art.md`](research/prior-art.md)(요약) · [`research/2026-07-17-prior-art-survey.md`](research/2026-07-17-prior-art-survey.md) · [`research/2026-07-17-prior-art-causes-and-legacy.md`](research/2026-07-17-prior-art-causes-and-legacy.md)
- 기술 옵션 조사(훅킹·시각화 레이어 후보): [`research/technical-options.md`](research/technical-options.md)
- React Flow UX 확장 가능 범위 조사(미구현): [`research/2026-07-17-react-flow-ux-capabilities.md`](research/2026-07-17-react-flow-ux-capabilities.md)
