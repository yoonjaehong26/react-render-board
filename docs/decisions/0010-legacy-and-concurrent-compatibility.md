# ADR-0010: class 컴포넌트/에러 바운더리/concurrent 기능(useTransition, Suspense) 호환성 검증

- 상태: 채택됨
- 날짜: 2026-07-17

## 맥락

지금까지의 모든 검증(exp1, exp2, 라이브 MVP 통합(ADR-0008), 실제 앱 검증(ADR-0009))은 전부 함수 컴포넌트 기준이었다. class 컴포넌트, 에러 바운더리, `useTransition`/`startTransition`, `Suspense`(특히 `use()`)에서 계측 로직(hooking/data 레이어)이 어떻게 동작하는지 전혀 확인된 바 없었다. ADR-0009는 "excalidraw가 lazy+Suspense를 안 써서 미검증으로 남는다"고 명시적으로 지적했다. class 컴포넌트/에러 바운더리는 그보다 더 근본적인 사각지대다 — bippy의 tag 기반 분류(`isCompositeFiber`)가 `ClassComponentTag`를 포함한다는 건 코드 레벨에서 확인 가능하지만(ADR-0008), 실제 커밋 스트림에서 정말 그렇게 동작하는지, 특히 architecture.md의 설계 원칙 1(계측이 대상 앱을 절대 멈추면 안 된다)이 "하위 트리가 렌더 중 에러를 던지는" 상황에서도 지켜지는지는 실측이 필요했다.

실제 제3자 앱을 다시 찾기보다 통제된 자체 fixture로 검증하기로 했다 — API 호환성 문제라 "실제 앱의 지저분함"보다 "특정 패턴 자체가 되는지"가 중요하기 때문이다(exp1/exp2가 이미 검증한 방법론과 동일).

## 검토한 대안

- **실제 제3자 앱에서 이 네 패턴을 쓰는 앱을 다시 찾기** — 기각. ADR-0009가 이미 "앱 하나로 검증 항목을 전부 못 커버한다"(excalidraw는 lazy+Suspense 자체가 없었다)는 걸 증명했고, 이번엔 패턴 자체의 API 호환성 문제라 지저분한 실제 앱보다 통제된 최소 재현이 원인 격리에 유리하다.
- **기존 도메인(shell/checkout/notifications)에 패턴을 섞어넣기** — 기각. 그러면 groupHint/그룹 경계가 기존 도메인과 뒤섞여 "이 결과가 새 패턴 때문인지 기존 로직 때문인지" 구분이 어려워진다. 새 도메인으로 분리해 원인을 격리했다.

## 결정

`src/fixtures/domains/{legacy,resilience,concurrent,asyncData}/`에 패턴별 fixture 4개를 추가하고 `domains/advanced/AdvancedPatterns.tsx`로 묶어 `DemoApp`에 상시 마운트했다. `scripts/verify-advanced-patterns.mjs`(Playwright, 저장소에 남김)로 각각 실제 커밋을 유발해 확인했다.

### 1. class 컴포넌트 — 정상 동작, 사각지대 아니었음

`ClassCounter`(`React.Component` 상속, state, bound 메서드)는 함수 컴포넌트와 동일하게 `ClassCounter.tsx` 그룹으로 잡히고, `setState` 후에도 노드 수/그룹 구조에 변화가 없다(상태만 바뀌는 커밋이므로 당연한 결과지만, 크래시나 예상 밖 그룹 이동이 없음을 확인했다는 데 의미가 있다). bippy 소스(`node_modules/bippy/dist/core.js`)를 직접 읽어 확인한 대로 `isCompositeFiber`는 `ClassComponentTag(1)`을 `FunctionComponentTag(0)`/`ForwardRefTag(11)`/`MemoComponentTag(14)`/`SimpleMemoComponentTag(15)`와 동일하게 취급한다 — `src/data/serialize.ts`의 `classify()`가 tag 기반이라 애초에 class/함수를 구분하는 로직 자체가 없다. 실측은 이 코드 레벨 추론을 확인해줬을 뿐, 새로운 문제는 발견되지 않았다.

### 2. 에러 바운더리 — 계측은 안 죽는다. fallback 트리 정확히 반영. 콘솔 노이즈는 React 자체 것

`ErrorBoundaryDemo`(class 기반 `Boundary` + 렌더 중 조건부로 throw하는 `Faulty`)로 에러를 유발했을 때:

- **캔버스가 죽지 않았다.** `pageerror`(uncaught) 0건. `hooking/fiberInspector.ts`의 try/catch(ADR-0008)가 필요하지도 않았다 — React가 이미 에러를 바운더리에서 흡수한 뒤 커밋하므로, `onCommitFiberRoot`가 받는 fiber 트리는 애초에 "fallback으로 대체된, 구조적으로 온전한" 트리다. 계측 레이어 입장에서는 에러 유발 여부와 무관하게 "그냥 또 다른 커밋"일 뿐이었다.
- **fallback 트리가 다음 커밋에 정확히 반영됐다.** 에러 유발 직후 캔버스에 "문제가 발생했습니다 (fallback)" 텍스트가 나타났고 노드 수는 38→37로만 줄었다(구조가 실제로 줄어든 만큼만 감소, 0으로 붕괴하지 않았다). "복구" 버튼(바운더리를 새 `key`로 강제 리마운트)으로 정확히 38로 복원됐다.
- **콘솔 에러 2건은 계측과 무관하다.** 하나는 React가 개발 모드에서 항상 찍는 "에러가 바운더리에 의해 처리됨" 로그, 하나는 fixture의 `componentDidCatch`가 의도적으로 찍은 로그다. `pageerror`(정말 처리 안 된 예외)는 0건이므로 architecture.md 설계 원칙 1("계측이 대상 앱을 멈추면 안 된다")은 에러 바운더리 시나리오에서도 성립한다.

### 3. useTransition/startTransition — 중간 상태는 관찰되지 않음(설계상 당연), 완료 후 트리 정상

`TransitionDemo`(의도적으로 무거운 렌더로 `isPending` 구간을 실측 가능한 폭으로 만든 fixture)로 확인:

- `isPending=true` 구간을 Playwright가 실제로 스크린샷에 포착했다 — 그동안 캔버스는 이전 커밋 상태(row 0~29)를 그대로 유지했고 깨지거나 빈 화면이 되지 않았다.
- transition 완료 후 host 노드(`li`)는 30개에서 530개로 늘었지만(헤더의 전체 노드 카운터에 반영됨: 커밋 #7 "30 / 97" → 커밋 #12 "30 / 250"), **composite 노드 수는 변하지 않았다.** `RowList`가 배열을 통째로 map하는 단일 컴포넌트라 항목이 늘어도 composite fiber가 추가로 생기지 않기 때문이다(`li`는 host 태그라 기본적으로 캔버스에서 숨겨진다). 버그가 아니라 "그룹 경계는 composite 단위"라는 기존 설계(ADR-0008)가 그대로 적용된 결과다.
- `onCommitFiberRoot`는 커밋 시점에만 발화하므로(architecture.md 설계 원칙 3) React가 내부적으로 진행하는 "미완료 work-in-progress" 렌더는 애초에 계측 대상이 아니다 — 즉 useTransition이 계측에 노출하는 리스크는 "중간에 이상한 트리를 보여주는 것"이 아니라 애초에 존재하지 않는 시나리오였다. 코드 레벨 추론이었지만, 실측으로도 반박되는 지점을 찾지 못했다.

### 4. Suspense(`use()`) — 초기 fallback, resolve, 재-suspend 전부 정상 커밋으로 반영됨

`SuspenseDemo`(`use(promise)` + `<Suspense fallback>`)로 확인:

- 초기 마운트 시 500ms 동안 fallback("로딩 중…")이 보였고, resolve 후 데이터로 정상 전환됐다. 이 전환이 별도 커밋(들)으로 발생했고 그때마다 캔버스가 매끄럽게 갱신됐다.
- "다시 로드"로 이미 resolve된 컴포넌트를 강제로 재-suspend시켰을 때도(50ms 시점에 fallback 재노출, 700ms 후 데이터 재노출을 각각 확인) 캔버스가 정상 갱신됐다 — 재-suspend는 첫 마운트보다 더 위험한 경로였는데(이미 존재하던 fiber가 다시 fallback으로 대체됨) 문제가 없었다.
- `SuspenseComponent`(tag 13)와 `OffscreenComponent`(tag 22)는 `isHostFiber`도 `isCompositeFiber`도 아니다(`node_modules/bippy/dist/core.js`에서 직접 확인). 따라서 `serialize.ts`의 `classify()`가 이 둘을 "React 내부 배관"으로 분류해 노드로 만들지 않고 자식을 조상에 재연결한다 — Suspense 경계 자체는 그룹/노드 구조에 나타나지 않고, `SuspenseDemo.tsx` 그룹 안에 fallback 또는 실제 컨텐츠 중 그 순간 커밋된 쪽만 자식으로 잡힌다. 이 매핑이 스크린샷에서 그대로 확인됐다.

### 5. 전체 세션 안정성

Advanced Patterns 4개를 모두 상호작용시킨 세션 전체에서 `pageerror`(uncaught exception) 0건, 예상된 것 외의 콘솔 에러 0건. 기존 회귀 검증(`scripts/verify.mjs`)도 `AdvancedPatterns`가 `DemoApp`에 추가된 상태로 재실행해 통과했다(38→39 노드 증가, groupHint pending 0건, semantic zoom 5% 지도 모드 전환 등 전부 기존과 동일하게 동작) — 새 fixture가 기존 도메인(shell/checkout/notifications)의 동작을 깨지 않았다.

## 근거

위 결과는 `scripts/verify-advanced-patterns.mjs`(Playwright, 재현 가능하도록 저장소에 남김)의 콘솔 로그와 `verify-output/advanced-patterns/`의 스크린샷(gitignore 처리)으로 뒷받침된다. bippy의 tag 상수(`ClassComponentTag=1`, `SuspenseComponentTag=13`, `OffscreenComponentTag=22`, `LazyComponentTag=16`, `isCompositeFiber`/`isHostFiber`의 실제 구현)는 `node_modules/bippy/dist/core.js`를 직접 읽어 재확인했다(ADR-0005/0007이 이미 겪은 "문서 대신 실제 코드/런타임 객체를 봐야 한다"는 교훈을 다시 적용한 것).

## 예상 밖 발견 (기록해 둘 것)

- **네 패턴 전부 architecture.md의 데이터 레이어 스키마를 흔들지 않았다.** 사전에는 "class 컴포넌트가 다른 tag 처리가 필요하지 않을까", "Suspense 경계가 노드로 나타나야 하지 않을까" 같은 우려가 있었지만, 기존 tag 기반 `classify()` 설계(ADR-0008)가 이미 이 모든 경우를 우연이 아니라 원리상 커버하고 있었다. `RenderNode` 스키마(`id`/`displayName`/`kind`/`parentId`/`groupHint`)에 "이건 class다"/"이건 에러 상태다"/"이건 pending이다" 같은 필드를 추가해야 하는 근거는 발견되지 않았다.
- **에러 바운더리 시나리오에서 계측 자체가 트리거하는 실패 지점이 없었다.** 이건 architecture.md 설계 원칙 1("devtools-only 실행")보다는, "커밋 시점에만 훅한다"(원칙 3)는 결정이 부수적으로 에러 복원력까지 벌어준 결과다 — React가 에러를 흡수해 만든 최종 트리만 관찰하므로, 계측 입장에서는 "에러가 발생했다"는 개념 자체가 존재하지 않는다.
- **useTransition의 "중간 상태" 리스크는 애초에 시나리오가 성립하지 않는다.** 커밋 시점 훅이라는 원칙이 여기서도 방어선 역할을 했다 — 원칙 1과 원칙 3은 서로 다른 이유(React-Sight의 다른 두 실패 원인)로 세워졌는데, concurrent 기능 앞에서 같은 종류의 보호를 우연히 함께 제공하고 있다는 게 이번에 명확해졌다.

## 결과

- class 컴포넌트/에러 바운더리/useTransition/Suspense(`use()`) 네 패턴 모두 **추가 스키마 변경이나 계측 로직 수정 없이** 기존 라이브 MVP(ADR-0008) 파이프라인을 그대로 통과했다. architecture.md의 데이터 레이어 절에 "검증된 패턴" 각주를 추가할 가치는 있지만(문서화 목적), "되돌리기 어려운 결정"인 스키마 자체를 바꿀 필요는 없다.
- `src/fixtures/domains/{legacy,resilience,concurrent,asyncData,advanced}/`와 `scripts/verify-advanced-patterns.mjs`는 회귀 스모크 테스트로 저장소에 남긴다.
- ADR-0009가 미검증으로 남긴 "lazy+Suspense" 중 Suspense(데이터 페칭, `use()`) 쪽은 이번에 커버됐다. `React.lazy`(코드 스플리팅)는 이 ADR의 범위 밖이라 여전히 미검증으로 남는다 — `LazyComponentTag(16)`가 `isCompositeFiber`의 tag whitelist에 없다는 것도 코드로 확인했는데(ADR-0008 당시엔 몰랐던 사실), React 내부적으로 lazy가 resolve된 뒤에는 실제 컴포넌트의 tag로 커밋되는 게 일반적이라 이 자체가 문제로 이어질 가능성은 낮아 보이지만 실측이 필요하다 — [ADR-0011](0011-lazy-suspense-code-splitting.md)에서 후속 검증했다.
