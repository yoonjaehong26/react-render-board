# Roadmap

## 접근 전략: MVP로 빠르게 검증 후 판단

AI 코딩으로 목업을 빠르게 만들 수 있으므로, 오래 고민하기보다 **MVP를 빠르게 만들어 기술 가능성·철학·UI를 QA**하고, 진짜 괜찮으면 그때 제대로 다시 만든다.

뒤로 갈수록 안정성·확장성은 늘지만 "틀린 걸 되돌리는 비용"도 같이 는다. 아직 아무것도 검증 안 된 지금은 되돌리기 쉬운 단계에서 시작한다.

### "처음부터 다시 만들기"에 대한 주의

리라이트는 보통 위험하다(엣지 케이스 지식을 버리게 되므로). 하지만 이 경우는 예외다 — 바이브 코딩 MVP의 목적은 "쓸 코드를 만드는 것"이 아니라 **"질문에 답을 얻는 것"**이기 때문이다.

원칙:

> **코드는 버려도 되지만, "왜 이렇게 결정했는지"는 버리면 안 된다.**

MVP를 만들며 결정 로그([`decisions/`](decisions/))를 함께 남긴다. 이것이 1단계와 이후 단계를 끊긴 두 프로젝트가 아니라 자연스러운 흐름으로 잇는다.

## 단계

### 실험 1 — 기술 가능성만 검증 ✅ 완료 (2026-07-17)

- bippy(또는 react-devtools-core)로 실제 React 앱에 훅을 걸어 Fiber 트리 데이터를 JSON으로 추출.
- **UI 없음.** 콘솔 출력만으로 충분.
- 목표: "이게 되는지 안 되는지" 반나절 안에 답 얻기.
- 참고: HiFiber(oslabs-beta)가 목표(실시간 Fiber 트리 + render/re-render 계측)와 가장 근접한 선행 사례([`research/prior-art.md`](research/prior-art.md)). 노드별 계측 삽입 지점을 코드 레벨로 참고할 가치가 있다.
- 훅킹 로직은 [`architecture.md`의 설계 원칙](architecture.md#선행-프로젝트-실패에서-얻은-설계-원칙)(devtools-only 실행, 재귀 순회 가드, 커밋 시점 훅)을 처음부터 지킨다 — 선행 프로젝트(React-Sight)가 이 부분에서 실패했다.
- **결과: 가능함을 확인.** `experiments/exp1-fiber-extraction/`에서 bippy 0.6.0으로 커밋 시점 Fiber 트리(Context, 리스트, state 업데이트 포함)를 JSON으로 정확히 추출했다. 세부 내용과 예상 밖 발견(예: `secure()`가 이 버전엔 없음)은 [`decisions/0005-exp1-fiber-extraction-feasibility.md`](decisions/0005-exp1-fiber-extraction-feasibility.md) 참고.

### 실험 2 — 철학 + UI만 검증 ✅ 완료 (2026-07-17)

- 실험 1의 JSON(또는 손으로 만든 가짜 데이터)을 React Flow에 넣어 클러스터링 + 줌 프로토타입 제작.
- **실시간일 필요 없음.** 실제 훅킹과 연결 안 해도 됨.
- 목표: UI 철학(영역 그룹핑 + semantic zoom)이 실제로 이해하기 좋은지 확인.
- **결과: 철학이 통함을 확인.** `experiments/exp2-flow-prototype/`에서 React Flow(xyflow)로 "영역 프레임 + 실제 노드 유지" 그룹핑과 zoom 값 기반 semantic zoom(지도 모드 ↔ 상세 모드)을 구현했다. exp1이 발견한 익명 Fiber 문제는 filter/dim 두 모드로 구현해 filter를 기본값으로 채택했고, 15개 도메인·257개 노드 규모의 가짜 데이터에서도 화면이 뭉개지지 않음을 Playwright 스크린샷으로 확인했다. 세부 내용과 예상 밖 발견(그룹 경계를 넘는 엣지, semantic zoom 구독 범위, host 노드 기본 숨김)은 [`decisions/0006-exp2-flow-prototype-ui-validation.md`](decisions/0006-exp2-flow-prototype-ui-validation.md) 참고.

### 라이브 MVP — 실험 1 + 2 통합 ✅ 완료 (2026-07-17)

- 두 실험이 각각 "괜찮다"는 확신이 서면 통합.
- 실제 앱에서 실시간으로 렌더 트리를 캔버스에 표시.
- **사전 검증: 그룹핑 힌트(소스 파일 경로) 실현 가능성 ✅ 완료 (2026-07-17)** — architecture.md 데이터 레이어의 "되돌리기 어려운 결정"인 그룹핑 힌트를 실제 bippy 데이터로 뽑을 수 있는지 확인. **결과: dev 빌드에서는 가능, production은 신뢰 불가.** bippy `getFiberSource`는 문서에만 있고 실제로는 `bippy/source`의 `getSource`임을 코드로 재확인했다(ADR-0005의 `secure()`와 동일한 문서-코드 드리프트). 그룹핑 힌트는 dev 전용으로 확정하고, 의미를 "컴포넌트가 사용된 파일"로 고정했다. 세부 내용은 [`decisions/0007-grouping-hint-feasibility.md`](decisions/0007-grouping-hint-feasibility.md) 참고.
- **결과: 실시간 통합이 실제로 동작함을 확인.** 저장소 루트 `src/`에 훅킹(exp1 재사용) / 데이터(exp1 순회 + ADR-0007 그룹핑 힌트 + exp2 전처리를 하나로 합침, 신규) / 시각화(exp2 재사용 + 레이아웃 재계산 전략 신규 설계) 3-레이어로 라이브 MVP를 구현했다. exp1의 테스트 앱을 확장(리스트 추가/삭제, 도메인 패널 마운트/언마운트 상호작용)해 Playwright(`scripts/verify.mjs`)로 상호작용 → 재렌더 → 캔버스 갱신을 스크린샷까지 포함해 확인했다: 노드 추가/삭제, 그룹(도메인) 전체의 마운트/언마운트, groupHint 비동기 해석, semantic zoom이 라이브 데이터에서도 모두 매끄럽게 동작했다. 익명/내부 Fiber 필터링 기준을 tag 기반(`isHostFiber`/`isCompositeFiber`)으로 통일하고, 레이아웃은 "그룹 순서 고정 + 그룹 단위 메모이제이션" 전략으로 재설계했다. 세부 내용과 예상 밖 발견(host 노드 자식의 groupHint 귀속 문제, React Flow 캔버스 높이 붕괴 등)은 [`decisions/0008-live-mvp-integration.md`](decisions/0008-live-mvp-integration.md) 참고.

### 판단 지점 ✅ 완료 (2026-07-17)

라이브 MVP로 기술 가능성·철학·UI를 QA한 뒤:

- 괜찮으면 → 안정적인 구조로 정식 재구현 + 오픈소스화.
- 아니면 → 배운 것(결정 로그)만 남기고 접거나 방향 전환.

**자체 fixture 평가 (2026-07-17):**

- **기술 가능성** — 확실히 괜찮다. 커밋 시점 훅킹, 그룹핑 힌트, semantic zoom이 실시간 스트림에서도 안정적으로 맞물렸다. 예상 밖 발견(bippy 문서-코드 드리프트가 세 번째로 재현됨, `containerInfo` 같은 타입에 없는 런타임 필드)이 두 개 더 나왔지만 전부 우회 가능했고, 프로젝트 규칙("README 대신 실제 `.d.ts`/런타임 객체 확인")이 계속 유효함을 재확인했다.
- **UI 철학** — 여전히 통한다. 그룹 프레임 + 실제 노드 유지 + semantic zoom이 라이브 데이터에서도 그대로 읽힌다. 다만 `getSource`의 "사용 위치" 의미가 host-only 자식에는 적용되지 않는다는 한계(ADR-0008)가 그룹 경계를 가끔 직관과 어긋나게 만든다.

**통과 기준: 우리가 만든 테스트 fixture가 아니라 실제 제3자 오픈소스 앱에서 QA해야 한다.**

실험 1·2·검증(그룹핑 힌트)이 전부 우리가 직접 만든/생성한 데이터로 검증됐던 한계를 넘어서기 위해, excalidraw(React 19, Radix UI, 283개 파일)를 clone해 라이브 MVP를 실제로 붙여 검증했다. 세부 내용은 [`decisions/0009-real-app-validation.md`](decisions/0009-real-app-validation.md) 참고.

**최종 판단: 조건부 진행(GO).**

- 실제 앱(646개 fiber 노드, 80개 그룹) 규모에서도 캔버스가 뭉개지지 않았고, memo/forwardRef 컴포넌트(Radix)가 정확히 이름으로 나왔고, 포털 서브트리가 논리적 부모 아래 올바르게 붙었고, 세션 전체에서 콘솔 에러 0건이었다 — React-Sight가 실패한 지점(계측이 대상 앱을 멈춤)이 재현되지 않았다.
- 다만 실제 앱이라서 드러난 두 가지 구체적 결함이 있다: **① 그룹핑 노이즈** — roadmap이 우려했던 "대부분 라이브러리로 수렴"은 아니었지만(80개 중 68개, 85%는 여전히 의미 있는 도메인 파일), Radix처럼 라이브러리가 자기 자신의 내부 컴포넌트를 합성하는 패턴에서 그룹 목록에 `node_modules` 내부 파일이 15% 섞여 들어갔다. **② 레이아웃 재계산 비용** — 보드를 연 채로 실제 인터랙션(도형 그리기)을 하면 응답 시간이 약 2.76배 늘었다(닫았을 때 433ms → 열었을 때 1196ms, 5회 기준). 둘 다 우회 가능한 디테일이지 데이터 스키마 같은 근본 결함은 아니다 — 정식 재구현 착수 시 1순위 백로그로 못박는다. **→ 아래 "추가 검증" 절(ADR-0012)에서 두 항목 모두 해소했다.**
- lazy+Suspense 경계는 excalidraw가 이 패턴을 안 써서 실제 앱으로는 미검증 — 자체 fixture 검증만 있는 상태로 남는다(블로커 아님, 향후 다른 앱으로 보강 가능). **→ 아래 "추가 검증" 절에서 자체 fixture로 이 항목을 닫았다.**
- `experiments/exp1-fiber-extraction/`, `experiments/exp2-flow-prototype/`은 이제 회귀 스모크 테스트 용도로만 쓴다. `experiments/real-app-validation/excalidraw/`(gitignore 처리, 로컬 재현용)와 `scripts/verify-real-app.mjs`(레포에 유지)로 언제든 재검증할 수 있다.
- vision.md가 던진 진짜 질문("완성 후에도 계속 붙잡을 동기가 있는가")과 "생존 전략"(dogfooding할지 커뮤니티 채택을 목표할지)은 이 판단 지점의 범위 밖으로, 정식 재구현 착수 전 별도로 답해야 한다.

### 추가 검증 — legacy class 컴포넌트 및 concurrent 기능 호환성 ✅ 완료 (2026-07-17)

판단 지점까지의 모든 검증(exp1·exp2·라이브 MVP·excalidraw)이 함수 컴포넌트 기준이었다는 사각지대를 메우기 위해, class 컴포넌트/에러 바운더리/`useTransition`/Suspense(`use()` 데이터 페칭)/`React.lazy`+Suspense(코드 스플리팅) 다섯 패턴을 통제된 자체 fixture(`src/fixtures/domains/{legacy,resilience,concurrent,asyncData,advanced,reports}/`)로 검증했다.

**결과: 다섯 패턴 전부 추가 스키마 변경이나 계측 로직 수정 없이 기존 파이프라인(ADR-0008)을 통과했다.** 기존 tag 기반 분류(`isHostFiber`/`isCompositeFiber`, ADR-0008)와 커밋 시점 훅(설계 원칙 3)이 원리상 이미 이 모든 경우를 커버하고 있었다 — class 컴포넌트는 `ClassComponentTag`가 애초에 `isCompositeFiber` whitelist에 있었고, 에러 바운더리는 React가 에러를 흡수한 뒤의 온전한 트리만 커밋에 노출되며, `useTransition`의 "중간 상태"는 커밋 시점 훅 앞에서 애초에 존재하지 않는 시나리오였고, `Suspense`/`Offscreen`/`Lazy` 관련 fiber tag들은 모두 host도 composite도 아니라 "React 내부 배관"으로 자연스럽게 걸러졌다. 세부 내용은 [`decisions/0010-legacy-and-concurrent-compatibility.md`](decisions/0010-legacy-and-concurrent-compatibility.md), [`decisions/0011-lazy-suspense-code-splitting.md`](decisions/0011-lazy-suspense-code-splitting.md) 참고. `scripts/verify-advanced-patterns.mjs`, `scripts/verify-lazy-suspense.mjs`는 회귀 스모크 테스트로 레포에 남겨둔다.

### 추가 검증 — 그룹핑 노이즈 흡수 + 레이아웃 재계산 성능 최적화 ✅ 완료 (2026-07-17)

판단 지점(ADR-0009)이 1순위 백로그로 못박은 두 결함을 해소했다: **① 그룹핑 노이즈**는 `node_modules` 내부 groupHint를 "아직 앱 소스로 resolve 안 됨"과 동일하게 취급해 가장 가까운 앱 소스 조상 그룹으로 흡수하도록 `visualization/lib/groups.ts`를 수정했고, **③ 레이아웃 재계산 비용**은 구독자 notify를 `requestIdleCallback`으로 커밋 프레임과 분리(`data/store.ts`)하고 React Flow `onlyRenderVisibleElements`를 추가(`visualization/Canvas.tsx`)해 줄였다.

**결과 (excalidraw 재검증, `scripts/verify-real-app.mjs`):**

| 지표 | 수정 전 | 수정 후 |
|---|---|---|
| `node_modules` 내부 경로 그룹 수 (전체 80개 중) | 12개 (15%) | 0개 (0%) |
| 인터랙션 응답 배율 (보드 열림 vs 닫힘) | 2.76배 (433ms → 1196ms) | 1.6~1.77배 (362~421ms → 642~672ms) |

그룹핑 노이즈는 완전히 해소됐고(반복 실행 2회 모두 0%), 레이아웃 성능은 개선됐지만 완전히 해소되지는 않았다(뷰포트 기반 부분 재계산은 다음 단계 백로그로 재이월). 세부 내용과 예상 밖 발견(디바운스가 실제 드래그 인터랙션에는 부분적으로만 배치 효과를 냈다는 점 등)은 [`decisions/0012-grouping-noise-and-layout-perf-fix.md`](decisions/0012-grouping-noise-and-layout-perf-fix.md) 참고. lazy+Suspense 검증은 이 작업과 병행 진행된 별도 세션이 ADR-0010/0011로 이미 닫았다(위 절 참고) — 이 ADR은 그 부분을 중복 문서화하지 않는다.

### 추가 스트레스 테스트 — 고빈도 렌더 갱신 ✅ 완료 (2026-07-17)

지금까지의 성능 검증(위 두 절)은 전부 "도형 몇 개를 수동으로 그리는" 짧고 산발적인 상호작용이었다 — 애니메이션·실시간 데이터·폴링·WebSocket처럼 **초당 여러 번 지속적으로 커밋이 발생하는 상황**은 검증되지 않았던 공백을 메웠다. 자체 fixture(`src/fixtures/domains/livefeed/LiveFeed.tsx`)로 10/30/60/120/240Hz의 지속적 state 갱신을 만들고, `?board=off` 토글(`src/main.tsx`)로 ADR-0009/0012와 같은 "보드 열림 vs 닫힘" 방법론을 재사용해 측정했다.

**결과: ADR-0012의 디바운스는 지속 고빈도 부하에서 완전히 무력화되지는 않지만(배치 비율이 Hz가 오를수록 1.00→3.86까지 커진다), 그것만으로는 버티지 못한다.** board=off(보드 미마운트)는 240Hz까지도 host 앱에 감지 가능한 부하가 없다 — 부하의 원인은 subject 앱이 아니라 보드가 열려서 매 notify마다 전체 노드를 재계산하는 것이다. board=on에서는 10Hz만 돼도 ADR-0012의 단발성 인터랙션 기준선(1.6~1.77배)을 이미 넘어서고(2.10배), 60Hz부터 명백히 architecture.md 원칙("계측이 대상 앱을 방해하면 안 된다")을 위반하는 수준(3.85배)이며, 120Hz 이상에서는 5~6배로 뚜렷하게 끊긴다. 실사용에서 참을 만한 실질적 한계선은 대략 10~30Hz로 본다.

5분 이상 지속 실행하는 메모리 누수 검증은 세 차례 시도 결과가 엇갈려(측정 환경 아티팩트 1건, 병행 세션과의 자원 경합으로 조기 종료 1건) 확정하지 못했다 — 가장 신뢰할 수 있는 단일 관찰(중단 없이 완주한 200초 구간)에서 강제 GC 후에도 힙이 +10MB 순증가해 완만한 누수 가능성을 배제하지 못하지만, 결론을 내리기엔 관찰 시간이 짧다. 격리된 환경에서 15분 이상 재실행하는 것을 후속 과제로 남긴다.

세부 수치와 예상 밖 발견(명목 Hz와 실제 커밋 처리량의 괴리, 백프레셔로 인한 자연 감쇠 등)은 [`decisions/0013-high-frequency-render-stress-test.md`](decisions/0013-high-frequency-render-stress-test.md) 참고. **뷰포트 기반 부분 재계산(ADR-0012가 보류한 백로그) 착수가 필요하다는 판단으로 이어진다** — 아래 절(ADR-0014)의 대규모 노드 수 스트레스 테스트도 독립적으로 같은 결론에 도달했다.

### 추가 스트레스 테스트 — 대규모(수천 개) 컴포넌트 ✅ 완료 (2026-07-17)

roadmap.md 원래 목표("컴포넌트 수백~수천 개 넘어가도 안 뭉개지는 UX") 중 "수백"만 실측됐고(excalidraw, 646개 fiber 노드) "수천" 쪽은 미검증이었던 공백을 메웠다. exp2를 2,000~5,000 노드·그룹 100개+ 규모로 확장한 순수 캔버스 테스트와, 실제 composite Fiber 수천 개를 마운트하는 합성 fixture(`src/fixtures/domains/stress/StressGrid.tsx`)로 라이브 훅킹 파이프라인의 인터랙션 응답 배율 스케일링을 측정했다.

**결과: 두 가지 서로 다른 병목이 서로 다른 지점에서 시작된다.**

- **지도 모드(semantic zoom map mode) 붕괴 — 대략 1,500~2,000개 노드 또는 그룹 100개 안팎부터.** `minZoom=0.05` 하드코딩 때문에 캔버스 전체 크기가 커지면 `fitView`가 전체를 담지 못해 "줌 아웃하면 전체가 한눈에 보인다"는 지도 모드의 전제가 깨진다(레이아웃 계산 자체는 5,000 노드까지도 한 자릿수 ms로 병목이 아니다). 우려했던 "그룹 라벨끼리 겹침"보다 더 나쁜 실패 모드(대부분의 그룹이 뷰포트 밖으로 밀려나 안 보임)로 나타났다.
- **인터랙션 응답성 붕괴 — 646개(ADR-0012, 1.6~1.77배)까지는 체감 지연이지만, 1,000개(10.85배)부터 명백히 나빠지고, 2,000개(31.6배)부터 실사용이 어렵고, 5,000개에서는 응답 불능에 가깝다.** ADR-0012의 `requestIdleCallback` 디바운스는 이 비용의 *실행 횟수*만 줄였을 뿐, Canvas 렌더링 파이프라인(레이아웃 엔진 + React Flow 재조정)의 *1회 비용 자체*가 노드 수에 초선형으로 느는 문제는 해결하지 못했다는 게 실측으로 확인됐다.
- **부수적으로 발견한 별도 결함(1순위 백로그): `src/data/serialize.ts`의 `MAX_DEPTH` 가드가 트리 깊이가 아니라 "한 부모 밑 형제 수"에도 소모된다.** 한 부모 아래 200개 넘는(실제 앱 실측으로는 100개 근방부터) flat한 자식(리스트/테이블의 흔한 패턴)이 있으면 조용히(콘솔 경고만 남기고) 순회가 끊겨 나머지가 시각화에서 사라진다 — 노드 총량과 무관하게 지금 코드로도 재현되는 버그다.

**실제 대형 오픈소스 앱(shadcn-admin, 500행 테이블, 9,240개 노드) 교차 확인으로 위 세 가지 중 두 가지(캔버스/지도 모드 붕괴, `MAX_DEPTH` 형제-카운팅 버그)가 완전히 독립적으로 재현됨을 확인했다** — 특히 `MAX_DEPTH` 버그는 실제 프로덕션급 어드민 대시보드에서도 지금 이 순간 재현되는 구조적 결함이라 우선순위를 가장 높게 뒀다. 인터랙션 응답 배율은 실제 앱(9,240개 노드, 1.91배)이 합성 fixture(2,000개대, 31.6배)보다 훨씬 낮게 나와, 배율이 노드 수뿐 아니라 상호작용이 유발하는 커밋 횟수에도 좌우된다는 게 추가로 드러났다(정확한 관계식은 후속 과제). 실패 사례로 시도했던 berry-admin(무료 티어라 최대 239개 노드에 그침)도 negative data로 남겼다. 세부 수치와 재현 방법(`scripts/verify-stress-scale.mjs`, `scripts/verify-stress-scale-live.mjs`, `scripts/verify-real-app-shadcn-admin.mjs`)은 [`decisions/0014-thousands-of-components-stress-test.md`](decisions/0014-thousands-of-components-stress-test.md) 참고.

### 판단 지점 이후 백로그 해소 — P0~P4 결함 수정 ✅ 완료 (2026-07-17)

ADR-0012~0015가 확인하고 [`project-status.md`](project-status.md)가 정식 재구현 착수 전 필수 반영 항목으로 못박은 결함 5건(P0~P4) 전부를 이번 라운드에서 해소했다. 순서는 의존관계를 따랐다 — P0(가장 싸고 다른 측정의 기준선이 됨) → P1(가장 크고, 프로파일링으로 정확한 병목을 먼저 특정한 뒤 구현) → P2+P3(P1이 만든 뷰포트 컬링 메커니즘을 그대로 재사용할 수 있어 같은 세션에 묶음) → P4(그룹 수 감소로 P2의 라벨 밀집도까지 완화하는 상호작용이 있어 마지막에 배치).

- **P0 — `MAX_DEPTH` 형제-카운팅 버그.** depth 가드를 자식 방향 재귀에만 적용하고, 형제 순회는 반복문(iterative)으로 바꿔 별도의(사실상 무제한에 가까운) 카운터로 순환 참조만 방어하도록 재설계했다. shadcn-admin 재검증 결과 총 노드 수가 9,240 → **9,818**로 늘고(잘려나가던 데이터가 실제로 잡힘), `MAX_DEPTH` 경고가 588~3,189건 → **0건**이 됐다. [`decisions/0016`](decisions/0016-max-depth-sibling-counting-fix.md).
- **P1 — Canvas 렌더링 파이프라인의 초선형 비용.** 먼저 프로파일링으로 병목을 정확히 특정했다: `normalizeForCanvas`/`toFlow`는 5,000노드에서도 수 ms였고, 진짜 비용은 React Flow가 `nodes` 배열 **크기**만큼(화면에 실제로 보이는 개수와 무관하게) 치르는 내부 wrapper 처리였다. 뷰포트/지도 모드에 따라 화면 밖 그룹은 프레임만 만들고 자식 노드·엣지는 아예 만들지 않는 방식으로 React Flow에 넘기는 배열 자체를 줄였다. 응답 배율이 646~5,000개 전 구간에서 **0.96~1.26배**로 평탄해졌다(수정 전 2,000개 11.69배, 5,000개 28.32배) — ADR-0013(고빈도 렌더)의 문제도 부수적으로 함께 해소됐다(60Hz 3.85배→1.01배). [`decisions/0017`](decisions/0017-viewport-based-partial-recompute.md).
- **P2 — 지도 모드 붕괴.** `minZoom`을 0.05→0.001로 낮춰 `fitView`가 더 이상 바닥에 막히지 않게 했고, 그 결과 드러난 "라벨이 안 보이는" 문제는 캔버스 줌의 역수를 라벨에 곱하는 counter-scale로 해결했다(그룹 프레임은 월드 좌표대로 줄지만 텍스트는 항상 읽을 수 있는 크기 유지). shadcn-admin 지도 모드가 "거의 백지"에서 "전체 콘텐츠가 화면에 들어오고 라벨을 읽을 수 있는" 상태로 바뀌었다. [`decisions/0018`](decisions/0018-map-mode-lod-and-camera-refit.md).
- **P3 — 카메라 정체.** 그룹 집합이 크게(생존율 30% 미만) 바뀔 때만 반응하는 auto-refit 휴리스틱과 `layout.ts`의 `groupOrder` pruning을 추가했다. berry-admin login 라우트 재현에서 "fit-view 조작 전/후 DOM 노드 수가 이미 동일"할 정도로 카메라가 자동으로 따라간다 — 수정 전에는 47/226(20.8%)만 화면에 보였다. [`decisions/0018`](decisions/0018-map-mode-lod-and-camera-refit.md).
- **P4 — 그룹핑 노이즈 판별 커버리지.** `node_modules` 리터럴 매칭에 더해 "상위 디렉터리로 거슬러 올라가는(`../`) 경로는 프로젝트 소스 루트 밖"이라는 화이트리스트 반전 규칙을 추가했다. berry-admin dashboard가 74개 그룹(다수가 `../../@mui/...` 등 노이즈) → **16개**(전부 클린), login이 45개 → **10개**(전부 클린)로 줄었다 — P2의 라벨 밀집도 완화에도 부수적으로 기여했다. [`decisions/0019`](decisions/0019-library-hint-whitelist-inversion.md).

다섯 항목 전부 excalidraw/shadcn-admin/berry-admin(실제 앱 3종) + 자체 fixture 회귀 테스트로 검증했고, 전 과정에서 콘솔/페이지 에러 0건을 유지했다. "메모리 누수 여부"(ADR-0013)와 "대형 라우트에서 groupHint 해석 급락"(ADR-0015)은 이번 스코프 밖 — 조사 필요 백로그로 남아 있다.

### 정식 재구현 1라운드 — 테스트 커버리지 + 배포 준비 + 훅킹 라이브러리 확정 ✅ 완료 (2026-07-17)

7-3(b)가 지목한 "검증된 3-레이어 구조를 정식 재구현"에 착수했다. 아키텍처·데이터 스키마는 이미 검증 완료(4절)라 다시 짜지 않았고, 대신 세 가지를 완료했다: **① [ADR-0002](decisions/0002-hooking-layer.md)의 열린 결정 확정** — bippy를 최종 훅킹 라이브러리로 못박고 react-devtools-core는 이 프로젝트의 같은-페이지 임베딩 모델(ADR-0020)과 아키텍처가 안 맞는다는 근거로 보류했다([ADR-0022](decisions/0022-hooking-library-confirmed-bippy.md)). **② 레이어별 테스트 커버리지** — vitest로 12개 파일·91개 유닛 테스트를 추가했다(데이터/훅킹 26개, 시각화 lib 38개, 시각화 컴포넌트 27개), P0(MAX_DEPTH)·P1(뷰포트 컬링)·P2/P3(라벨 역-스케일)·P4(화이트리스트 반전) 전부를 회귀 테스트로 고정했다. **③ 패키지 배포 준비** — `src/index.ts` 공개 API, `package.json`의 react/react-dom peerDependencies 전환, `vite.lib.config.ts` + `tsconfig.lib.json` 기반 라이브러리 빌드(`npm run build:lib`)를 추가했다(실제 npm publish는 스코프 밖).

이번 라운드가 건드린 소스 로직은 `Canvas.tsx`의 순수 기하 계산 3개를 `visualization/lib/geometry.ts`로 옮긴 것 하나뿐이다(동작 변화 없음, react-refresh lint 규칙 대응). 재검증 결과 자체 fixture(`scripts/verify.mjs`)와 excalidraw 실제 앱(`scripts/verify-real-app.mjs`, 그룹 67개 전부 클린·응답 배율 0.92배) 모두 콘솔 에러 0건으로 회귀 없음을 확인했다. 세부 내용은 [`decisions/0023`](decisions/0023-production-hardening-tests-and-package-prep.md) 참고.

## 생존 전략을 처음부터 정한다

2단계 조사 결과([`research/prior-art.md`](research/prior-art.md)) 죽은 선행 프로젝트 5개 중 4개가 부트캠프 코호트 프로젝트였고, 코호트 종료와 함께 유지관리가 끊겼다. 살아남은 사례는 두 갈래뿐이었다: 회사가 자사 도구로 매일 쓰는 dogfooding(Reactotron), 또는 커뮤니티 채택이 임계질량을 넘는 경우(React Scan). 판단 지점("정식 재구현" 여부)에 도달하기 전에, 이 프로젝트를 어느 쪽으로 끌고 갈지(자기 프로젝트에 계속 쓸 것인지, 커뮤니티 채택을 목표할 것인지) 스스로 답을 갖고 있어야 "완성 후 방치"를 피할 수 있다.

## 대규모 스케일은 처음부터 설계에 반영

선행 프로젝트들이 대형 앱에서 무너졌으므로, "컴포넌트 수백 개 넘어가도 안 뭉개지는 UX"(접기/펼치기, 검색, 부분 렌더링)를 초기 설계에 넣는다. 이것이 이번 조사에서 나온 가장 중요한 인사이트다.

## 오픈소스 프로세스에 대한 메모

CONTRIBUTING.md, 이슈 템플릿, PR 리뷰 프로세스 같은 격식은 **나중에 추가해도 비용이 거의 안 든다** (잘 관리되는 다른 프로젝트 것을 참고 가능). 반면 데이터 스키마 같은 아키텍처 결정은 나중에 고치기 비싸다.

→ 오픈소스 운영 지식은 정식 재구현 단계에서 배워도 늦지 않다. 지금 필요한 건 "3개월 뒤에도 이게 흥미로울까"에 대한 감각이고, 그건 MVP를 직접 만들어봐야 안다.
