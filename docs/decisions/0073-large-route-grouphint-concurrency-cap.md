# ADR-0073: 대형 라우트 groupHint 해석 급락 — 동시성 캡 + 타임아웃 재시도 분리

- 상태: 채택됨(구현)
- 날짜: 2026-07-20

## 맥락

ADR-0015 백로그 4번(project-status.md 5절 "조사 필요")의 미해결 항목: **대형 라우트에서 groupHint 해석이 급락한다.** berry-admin 실측에서 dashboard(1716 fiber)는 login(288)보다 그룹이 훨씬 심하게 1~3개로 뭉쳤다(과잉 흡수). ADR-0015는 "fiber 수/동시성과 `getSource` 해석 성공률의 상관관계를 별도 조사할 가치가 있다"며 원인 규명을 백로그로 남겼고, 그 사이 ADR-0071이 같은 레이어에 5초 타임아웃을 추가했다.

이번 라운드는 그 원인을 코드 레벨에서 규명하고 고친다.

## 진단

### 1. 구조적 원인 — 무제한 단일 `Promise.all` + 배치 전역 타임아웃

`resolveGroupHints`(`src/data/sourceHints.ts`)는 pending 전체를 **동시성 캡·청킹 없이 하나의 `Promise.all`**로 던졌다. `entries.map(async …)`이 N개의 `getSource`를 한 번의 동기 스윕으로 착수시키므로, ADR-0071이 각 호출에 감싼 **5초 타임아웃 타이머가 전부 배치 착수 시점(t=0)에 동시 시작**한다. 즉 5초는 fiber별 예산이 아니라 **배치 wall-clock에 걸린 공유 데드라인**처럼 작동한다.

- `store.ts`의 `handleCommit`은 라우트의 **첫 커밋에서 트리 전체의 미캐시 composite를 단 하나의 배치**로 모은다 — 대형 라우트일수록 이 첫 배치가 거대하다.
- 배치 wall-clock을 늘리는 두 채널:
  - **네트워크(지배적)**: `getSource`(bippy)는 결국 sourcemap을 `fetch`한다. bippy가 파일 단위로 dedup하지만(`node_modules/bippy/dist/get-source.js`의 in-flight `j` / resolved `A` 캐시), **distinct 소스 파일 수만큼은 fetch**한다. 대형 라우트는 컴포넌트 파일이 수십~수백 개 → HTTP/1.1 오리진당 ~6 커넥션 한계로 큐잉되고, 하필 라우트 진입/lazy 청크 로드 시점이라 Vite dev 서버가 자기 모듈+맵을 서빙하는 순간과 겹친다.
  - **메인스레드 CPU**: 심볼리케이션 폴백(`Y`/`we`/`_e`/`K`, owner-stack 재실행)은 단일 스레드라 fiber 수만큼 직렬화된다.

결과: 큐 뒤쪽 fiber는 실제 fetch가 아니라 **"자기 차례 대기"만으로 5초 예산을 태워** 억울하게 타임아웃 → `groupHint: null` 폴백된다. 배치가 클수록 이 비율이 오른다 → **대형 라우트일수록 null 비율↑**.

### 2. ADR-0071과의 상호작용 — 급락을 sticky하게 만든다

ADR-0071은 hang 방지를 위해 5초 타임아웃을 넣고, "타임아웃된 id도 `hintCache`에 캐시해 재시도하지 않는다"고 결정했다(`store.ts`). 그런데 이는 **일시적 경합으로 인한 타임아웃까지 세션 내내 영구 null로 굳힌다.** 첫 대형 배치에서 5초를 넘긴 fiber는 이후 커밋의 pending에서 제외돼 **영영 재해석되지 않는다.** ADR-0071은 "번들러 무관 hang 방지"라는 정당한 목적이었지만, 부작용으로 대형 라우트 급락을 sticky하게 만들었다.

### 3. 증폭 — null → 조상 흡수로 비선형 붕괴

null groupHint는 `groups.ts`의 `resolveEffectiveGroups`에서 **가장 가까운 앱-소스 조상 그룹으로 흡수**된다. 그래서 null "비율"과 화면 "그룹 수"의 관계는 선형이 아니라 절벽이다 — null 비율이 임계를 넘으면 진입점 근처 소수 조상만 살아남아 전 서브트리가 1~3개 mega-group으로 붕괴한다(ADR-0015 §예상밖의 "최초 진입점 근처 단 하나의 resolve된 조상에 몰림"과 일치). login(낮은 null율)은 44개 유지, dashboard는 붕괴 — "훨씬 심하게 뭉친다"의 정체다.

### 실측으로 소거한 가설

라이브 MVP(StressGrid, `?stressCount=`)로 파이버 수를 11,195까지 키워도 **타임아웃 0, 실패 0, 그룹 수 안정(30개)**이었다. StressGrid의 수천 composite는 전부 단일 파일로 해석되고 bippy가 fetch를 dedup+캐시하므로, 파이버가 아무리 많아도 distinct-fetch가 안 늘어 비용이 0이다. 즉 **급락의 원인은 파이버 "개수"가 아니라 distinct 소스 파일 수(=필요한 fetch 수)와 그 fetch가 라우트 로드와 경합하는 타이밍**임이 소거법으로 확인됐다(로컬 fixture는 distinct 파일 다수+lazy 로드 경합을 재현 못 해 delta는 못 보이지만, "개수 가설"은 반증한다).

## 결정

### 1. `getSource` 동시성 캡 (주 수정) — `sourceHints.ts`

단일 `Promise.all`을 **동시성 8로 제한한 async 풀**(`mapWithConcurrency`)로 교체한다. 워커 8개가 큐를 소진하므로 각 작업(=각 `getSource`+타임아웃)이 **"착수될 때" 비로소 시작**된다 — 5초가 큐 대기가 아니라 진짜 fetch를 재는 예산이 된다. 이것이 대형 라우트 급락의 가장 직접적 원인(모든 타이머가 t=0에 시작)을 제거한다.

- 8인 이유: bippy가 fetch를 파일 단위로 dedup하고 브라우저 HTTP/1.1 커넥션이 오리진당 ~6이라, 8이면 병렬성을 살리면서 thundering-herd를 막는다.
- 순수 구조 변경이라 결과 스키마·순서는 그대로다(store는 id 키로 소비, 순서 무관).

### 2. 타임아웃 폴백을 정상 null과 구분해 제한적 재시도 — `sourceHints.ts` + `store.ts`

`GroupHintResult`에 `timedOut?: boolean`을 추가해 "정상적으로 null(owner-stack 파싱 실패 등, 안정적 답)"과 "5초 타임아웃 폴백(불안정, 회복 가능)"을 구분한다. `store`는:

- **정상 결과**: 지금처럼 `hintCache`에 확정 캐시.
- **타임아웃**: `MAX_GROUP_HINT_TIMEOUT_RETRIES`(=2)까지는 캐시하지 않아 **다음 커밋 pending에 다시 잡혀 재해석**된다(전이적 경합 타임아웃 회복). 예산을 소진하면 null로 확정 캐시해 **genuine hang(Turbopack 등)에서 매 커밋 재발사를 막는다** — ADR-0071의 수렴성은 지킨다.

동시성 캡(#1)만으로도 경합 타임아웃 자체가 크게 줄지만, 남은 것을 이후 커밋에서 회복시켜 sticky 붕괴를 되돌린다.

### 3. 5초 값 자체는 유지

실측상 정상 경로는 수십~수백 ms라 5초는 넉넉하다. 값을 낮추면 오히려 경합 순간의 정상 fetch를 죽인다 — 문제는 값이 아니라 동시성 부재였다.

## 검증

- **유닛 테스트**: `sourceHints.test.ts`에 동시성 캡 테스트(50개 배치에서 동시 in-flight ≤ 8, 전 id resolve) 추가 + 기존 hang 타임아웃 테스트를 `timedOut: true` 반영으로 갱신. `store.test.ts`에 재시도 테스트 2개(예산 소진 후 null 확정·재해석 중단 / 타임아웃 후 성공 시 캐시·재시도 중단) 추가. 전체 **346개 통과**, `npm run typecheck` 통과.
- **라이브 스모크**: `?stressCount=2000`에서 그룹 30개·타임아웃 0·에러 0으로 기존과 동일(구조 변경이 정상 경로를 회귀시키지 않음 확인).

## 결과

- 대형 라우트에서 각 fiber의 타임아웃 예산이 "큐 대기"가 아니라 "실제 fetch"에 쓰이도록 바로잡아, 경합으로 인한 억울한 null 폴백을 제거했다. 남은 타임아웃도 이후 커밋에서 회복돼 sticky 붕괴가 풀린다. ADR-0071의 hang 방지·수렴성은 재시도 예산 소진 경로로 그대로 유지된다.
- **한계(정직하게 남김)**: 로컬 fixture(StressGrid)는 단일 파일이라 distinct-fetch 경합을 재현 못 해, 이 수정의 효과를 대형 실제 라우트에서 정량 delta로 측정하진 못했다. berry-admin류 대형 다중-파일 라우트에서의 재측정은 실사용/다음 실제 앱 검증 라운드에서 확인한다. 다만 원인(모든 타이머 t=0 동시 시작 + 타임아웃 영구 캐시)은 코드 라인으로 특정됐고, 유닛 테스트로 두 수정의 동작을 못박았다.

## 관련
- [ADR-0015](0015-routing-transition-validation.md)(백로그 4 "대형 라우트 groupHint 급락" — 이 ADR이 그 원인 규명·수정)
- [ADR-0071](0071-group-hint-batch-hang-timeout.md)(5초 타임아웃 도입 — 이 ADR이 그 타임아웃과 재시도 정책을 조율)
- [ADR-0007](0007-grouping-hint-feasibility.md)(groupHint의 dev 전용·null 폴백 설계)
- [ADR-0019](0019-library-hint-whitelist-inversion.md)(null/라이브러리 힌트의 조상 흡수 — 급락 증폭 경로)
