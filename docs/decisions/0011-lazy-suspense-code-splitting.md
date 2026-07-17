# ADR-0011: React.lazy + Suspense(코드 스플리팅 경계) 호환성 검증

- 상태: 채택됨
- 날짜: 2026-07-17

## 맥락

ADR-0009 ④는 excalidraw 검증에서 "memo/forwardRef/lazy/portal 처리는 대체로 정확했지만, excalidraw가 `React.lazy`를 쓰지 않아 lazy+Suspense 경계 처리는 확인하지 못했다"고 명시적으로 미검증 항목으로 남겼다. ADR-0010은 같은 검증 라운드에서 Suspense를 다뤘지만 데이터 페칭(`use()`) 경로만 확인했고, 코드 스플리팅(`React.lazy(() => import(...))`) 경로는 범위 밖으로 남겼다 — 둘 다 `Suspense`를 쓰지만 fiber tag 구성이 다르다: `React.lazy`는 커밋 사이에 `LazyComponentTag(16)`라는, `isCompositeFiber`/`isHostFiber` 어느 쪽에도 없는(ADR-0010에서 코드로 확인) 별도 tag를 잠깐 거친다는 점에서 별개로 검증할 가치가 있었다.

## 검토한 대안

- **ADR-0009처럼 lazy+Suspense를 실제로 쓰는 제3자 앱을 다시 찾기** — 기각. ADR-0009가 이미 "앱 하나로 검증 항목을 전부 못 커버한다"는 걸 보여줬고, 이번엔 특정 fiber tag(`LazyComponentTag`)가 커밋에 어떻게 반영되는지가 핵심이라 실제 앱의 규모/노이즈보다 최소 재현이 낫다.
- **ADR-0010의 `SuspenseDemo`(`use()` 기반)를 재사용/확장** — 기각. `use(promise)`는 애초에 `LazyComponentTag`를 거치지 않는 별개 경로라, 같은 fixture로는 이번 검증 대상(동적 `import()`가 실제로 새 청크를 받아오고 `LazyComponentTag`를 거쳐 resolve되는 과정)을 재현할 수 없다.

## 결정

`src/fixtures/domains/reports/`에 `LazyReportView.tsx`(동적 import 대상, 별도 파일이어야 실제 코드 스플리팅 경계가 생긴다)와 `ReportsPanel.tsx`(`React.lazy` + `Suspense`로 감싸는 컨테이너)를 추가하고 `DemoApp`에 상시 마운트했다(패널 자체는 토글, 기본은 닫힘). `scripts/verify-lazy-suspense.mjs`(Playwright)로 실제 동적 import를 유발해 확인했다. dev 서버(로컬 모듈)에서는 `import()`가 네트워크 왕복 없이 거의 즉시 resolve돼 fallback이 화면에 잡히지 않을 수 있어, `lazy()`의 resolve 체인에 400ms 인위 지연을 넣어 fallback 구간을 실측 가능하게 만들었다.

### 1. 동적 import 이전 — 그룹이 미리 존재하지 않음(정상)

패널을 열기 전에는 `LazyReportView.tsx` 그룹이 그룹 목록에 없었다. 아직 청크가 로드되지 않았으니 해당 컴포넌트의 fiber 자체가 존재하지 않는 게 맞고, 실측이 이를 확인했다 — "미리 자리만 잡아두는" 유령 그룹 같은 건 생기지 않았다.

### 2. Suspense fallback 구간 — 정상 포착, 캔버스 안 깨짐

"보고서 열기" 클릭 직후 `Suspense fallback`("보고서 로딩 중…")이 Playwright에 포착됐고, 그 구간 동안 캔버스는 정상 상태를 유지했다(빈 화면이나 크래시 없음). `LazyComponentTag`가 `isCompositeFiber`/`isHostFiber` 어느 쪽도 아니라는 점(ADR-0010에서 확인)은 우려할 요소였다 — 혹시 이 tag를 가진 fiber가 커밋 도중 그대로 `serialize.ts`를 통과하며 예외를 유발하지 않을지가 관심사였는데, 실제로는 문제가 없었다: `classify()`가 알 수 없는 tag를 만나면 그냥 "React 내부 배관"으로 처리해 건너뛰는 기존 로직(ADR-0008)이 `LazyComponentTag`에도 그대로 적용됐다.

### 3. resolve 후 — 실제 컴포넌트 이름으로 정확히 그룹핑됨

`import()` + 인위 지연(400ms) 후 `LazyReportView.tsx` 그룹이 정확한 이름으로 나타났고, 그 안에 `Q1 매출`/`Q2 매출` 콘텐츠가 실제로 표시됐다. 이는 두 가지를 동시에 확인해준다:

- **커밋된 fiber는 `LazyComponentTag(16)`가 아니라 resolve된 실제 컴포넌트의 tag(`FunctionComponentTag`)다.** ADR-0010이 "React 내부적으로 lazy가 resolve된 뒤에는 실제 컴포넌트의 tag로 커밋되는 게 일반적"이라고 추론만 하고 남겨뒀던 부분을 이번에 실측으로 확인했다 — `LazyComponentTag`는 React 내부 reconciliation 과정에서만 잠깐 존재하고, `onCommitFiberRoot`가 관찰하는 커밋된 트리에는 나타나지 않는다.
- **groupHint(`getSource`, ADR-0007)가 동적 import로 로드된 컴포넌트에도 정상 동작한다.** `LazyReportView`가 정의된 파일(`LazyReportView.tsx`) 그대로 그룹 이름이 잡혔다 — 별도 청크로 분리된 컴포넌트라고 해서 `getSource`가 실패하거나 다른 값을 반환하지 않았다.

### 4. 닫기 → 재-열기 — 캐시된 lazy 모듈 재사용 경로도 정상

패널을 닫자 `LazyReportView.tsx` 그룹이 그룹 목록에서 사라졌다(언마운트가 정확히 반영됨). 다시 열었을 때는 `React.lazy`가 이미 로드한 모듈을 캐시해서 재사용하므로 Suspense fallback 없이(또는 매우 짧게) 곧바로 콘텐츠가 나타났는데, 이 경로에서도 그룹/노드가 정상적으로 재구성됐다.

### 5. 안정성

전체 시나리오(닫힘 → 열기 → fallback → resolve → 닫기 → 재열기)에서 콘솔 에러 0건, `pageerror`(uncaught) 0건 — ADR-0010의 Suspense(`use()`) 결과와 마찬가지로 완전히 깨끗했다. 에러 바운더리 시나리오(ADR-0010)와 달리 이번엔 React 자신이 찍는 로그조차 없었다(에러가 아예 발생하지 않았으므로 당연하다).

## 근거

위 결과는 `scripts/verify-lazy-suspense.mjs`(Playwright, 재현 가능하도록 저장소에 남김)의 콘솔 로그와 `verify-output/lazy-suspense/`의 스크린샷(gitignore 처리)으로 뒷받침된다. `LazyComponentTag`의 값과 `isCompositeFiber`/`isHostFiber` whitelist에서의 부재는 ADR-0010이 `node_modules/bippy/dist/core.js`를 직접 읽어 확인한 내용을 그대로 재사용했다.

## 예상 밖 발견 (기록해 둘 것)

- **`LazyComponentTag`가 whitelist에 없다는 사실이 실제로는 전혀 문제가 되지 않았다.** ADR-0010 작성 시점에는 이게 잠재적 위험 요소로 보였다("이 tag를 만나면 어떻게 되지?") — 실측해보니 React가 커밋 시점까지 이 tag를 노출하지 않기 때문에 애초에 `classify()`가 이 tag를 볼 일이 없었다. "코드에 없는 tag를 위한 처리가 없다"는 사실 자체가 문제가 아니라, 그 tag가 언제 관찰 가능한 시점(커밋)에 등장하는지가 핵심이라는 걸 다시 확인했다 — 이는 ADR-0010의 "커밋 시점 훅(원칙 3)이 여러 concurrent/비동기 시나리오에서 방어선 역할을 한다"는 결론과 같은 패턴이다.
- **동적 청크 분리가 groupHint의 "사용 위치" 의미(ADR-0007)에 영향을 주지 않았다.** `getSource`가 소스맵/파일 경로 기반이라 번들이 여러 청크로 쪼개지는 것과 무관하게 동작할 거라는 예상이 있었는데, 이번이 실제 코드 스플리팅 상황에서의 첫 실측 확인이었다.

## 결과

- `React.lazy` + `Suspense` 조합도 **추가 스키마 변경이나 계측 로직 수정 없이** 기존 라이브 MVP(ADR-0008) 파이프라인을 통과했다. ADR-0009 ④와 ADR-0010이 남긴 lazy+Suspense 미검증 항목이 이것으로 완전히 닫혔다.
- `src/fixtures/domains/reports/`와 `scripts/verify-lazy-suspense.mjs`는 회귀 스모크 테스트로 저장소에 남긴다.
- ADR-0010과 합쳐, class 컴포넌트/에러 바운더리/useTransition/Suspense(`use()`)/`React.lazy`+Suspense까지 함수 컴포넌트 이외의 주요 React 패턴 전부가 자체 fixture 수준에서 검증됐다. 정식 재구현 단계로 넘어가기 전 남은 검증 공백은 없다고 판단한다(실제 앱 규모에서의 재확인은 ADR-0009가 이미 다른 축으로 다뤘고, 이번 패턴들은 API 호환성 문제라 실제 앱 규모 재검증의 필요성이 낮다).
