# ADR-0071: `groupHint` 해석 배치 hang 타임아웃 — 영구 "(그룹 확인 중…)" 수정

- 상태: 채택됨(구현)
- 날짜: 2026-07-19

## 맥락

실사용 리포트(다른 프로젝트에 `react-render-board`를 설치해 쓴 세션): Next 16 + Turbopack 프로젝트에서 보드를 열면 렌더 트리 캡처 자체는 정확했다(구조·이름 전부 실제 앱과 일치, 콘솔 에러 0건). 그런데 앱 컴포넌트 77개 **전부**가 "(그룹 확인 중…)" 라벨에 갇힌 채 1.5초/10초/25초가 지나도 풀리지 않았다. 리포트는 "Turbopack에서 owner-stack 기반 소스 경로 파싱이 안 먹히는 것 같다"고 추정하며 이 저장소에 이슈로 남길 걸 제안했다.

## 진단

`src/data/store.ts`의 `handleCommit`은 커밋마다 아직 캐시 안 된 composite fiber id를 모아 `resolveGroupHints(pending)` **한 번**을 돌리고, 그 결과가 오면 `hintCache`에 채운 뒤 다시 그린다.

`resolveGroupHints`(`src/data/sourceHints.ts`)는 각 fiber에 대해 bippy `getSource(fiber)`를 호출하고 **rejection만 try/catch로 잡는다.** `getSource`는 내부적으로 sourcemap을 `fetch`하는데(node_modules bippy `dist/get-source.js`의 `pe`/`I`/`L`), 이 fetch가 **거부되지 않고 그냥 응답 없이 pending 상태로 영원히 남을 수 있다** — 개발 서버가 특정 sourcemap 요청에 끝내 응답을 안 주는 경우 등, 어떤 번들러에서도 이론상 발생 가능하다. 이 경우 콘솔에는 아무 에러도 안 찍힌다(reject가 아니므로 catch가 안 걸림 — 리포트의 "에러 없음"과 일치).

여기서 결정적인 부분: `resolveGroupHints`는 전체 pending 배치를 **하나의 `Promise.all`**로 묶는다. 배치 안 fiber 하나의 `getSource`가 hang하면 그 fiber의 async 콜백이 영원히 안 끝나고, `Promise.all`은 전부 끝나야 resolve되므로 **배치 전체가 영원히 안 끝난다** — `hintCache`가 단 하나도 안 채워지고, `handleCommit`의 `.then()`도 안 불린다. 캡처된 앱 컴포넌트가 전부 한 커밋의 같은 배치에 들어가면(초기 커밋에서 흔함), 정확히 리포트대로 **전부**가 "(그룹 확인 중…)"에 영구히 갇힌다.

즉 Turbopack의 owner-stack 파싱 실패가 원인이 아니라(그건 실패해도 null을 반환해 파일 그룹핑으로 정상 폴백한다, `sourceHints.ts` 주석 참고), **hang에 대한 타임아웃이 코드 어디에도 없다는 아키텍처 결함**이 원인이다. 재현 조건(어떤 sourcemap fetch가 dev 서버에서 응답 없이 pending)이 Turbopack 환경에서 우연히 걸렸을 뿐, 번들러 종류와 무관한 버그다.

## 결정

`resolveGroupHints`에서 개별 `getSource(fiber)` 호출을 5초 타임아웃으로 감싼다(`withTimeout`, `Promise.race` 방식). 타임아웃되면 그 id는 `groupHint: null`로 (기존에도 있던) 파일 그룹핑 폴백 경로를 타고, 나머지 배치 항목은 영향받지 않는다.

- 5초는 임의값이지만 정상적인 sourcemap fetch(로컬 dev 서버, 보통 수십~수백 ms)보다 넉넉하고, "몇 초 정도는 확인 중이 정상"이라는 리포트의 관찰(1.5초는 이상하다고 못 느낌)과도 맞는다.
- 타임아웃된 id도 정상적으로 `hintCache`에 캐시되므로(값이 `null`일 뿐), 다음 커밋에서 같은 fiber를 또 hang시키며 재시도하지 않는다.

## 검증

`sourceHints.test.ts`에 hang 재현 테스트 추가: `getSource`가 절대 안 풀리는 fiber와 정상 fiber를 같은 배치에 넣고 `vi.useFakeTimers()` + `advanceTimersByTimeAsync(5000)`로 타임아웃을 진행시켜, hang한 항목은 `groupHint: null`로 폴백하고 **정상 항목은 영향 없이 resolve됨**을 확인. 기존 20개 테스트(rejection 처리 등) 전부 통과. `npm run typecheck` 통과.

## 결과

- 어떤 번들러에서도(Turbopack뿐 아니라) sourcemap fetch가 무응답으로 hang하는 상황에서 보드가 영구히 멈추지 않고 5초 후 파일 그룹핑으로 정상 동작한다.
- 리포트가 제안한 "Turbopack 자체 이슈로 별도 등록"은 불필요 — 원인이 번들러가 아니라 우리 쪽 hang 처리 부재였다.
- Turbopack에서 실제로 sourcemap fetch가 왜 무응답이었는지(정확한 근본 원인)는 여전히 미규명이다. 재현 fixture가 없어 이번 라운드에서는 조사하지 않았다 — 타임아웃 가드로 증상은 막혔지만, 같은 프로젝트에서 재발하면 그때 구체적 URL/응답을 캡처해 근본 원인을 좁힐 수 있다.

## 관련
- [ADR-0007](0007-grouping-hint-feasibility.md)(groupHint의 dev 전용 성격, null 폴백 설계)
- [ADR-0070](0070-devtools-extension-hook-preemption-and-stale-script-refresh.md)(같은 실사용 계열의 Next+Turbopack 문제, 원인은 다름 — 0070은 훅 자체가 안 걸림/root 오염, 이건 훅은 걸렸는데 데이터 해석 단계가 hang)
