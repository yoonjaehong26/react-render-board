# ADR-0007: 그룹핑 힌트(소스 파일 경로) 실현 가능성 검증

- 상태: 채택됨
- 날짜: 2026-07-17

## 맥락

architecture.md의 데이터 레이어 초안은 노드 스키마에 "그룹핑 힌트: 소스 파일 경로 또는 도메인(클러스터링용)"을 담기로 했고, 이 스키마는 architecture.md 스스로 "되돌리기 어려운 결정"이라고 명시한다. 그런데 실험 2(ADR-0006)는 이 힌트를 실제 bippy 데이터에서 뽑지 않고 fixture에 손으로 채워 넣어 흉내만 냈다. "소스 파일 경로를 실제로 안정적으로 뽑을 수 있는가"는 라이브 MVP 착수 전 마지막 미검증 사항이었다.

technical-options.md는 bippy의 `getFiberSource`를 그룹핑 힌트 후보 유틸로 언급했다. ADR-0005가 `secure()`에서 문서와 실제 배포 버전 사이의 API 드리프트를 이미 한 번 발견한 전례가 있으므로, 이번에도 문서를 그대로 믿지 않고 실제 설치된 bippy 0.6.0의 코드로 직접 검증했다.

`experiments/exp1-fiber-extraction/`을 확장해 검증했다: `src/source-spike.ts`(새 파일)가 `bippy/source`의 `getSource(fiber)`를 커밋마다 composite fiber에 대해 호출해 결과를 콘솔에 출력한다. 교차 파일 그룹핑 의미를 확인하기 위해 `src/domains/shared/Button.tsx`(공유 컴포넌트)와 `src/domains/checkout/CheckoutPanel.tsx`(이를 렌더하는 도메인 컴포넌트)를 fixture로 추가했다. Playwright로 dev 서버, `vite build`(소스맵 없음), `vite build`(소스맵 있음) + `vite preview` 세 가지 조건에서 콘솔 출력을 캡처했다.

## 검토한 대안

- **소스 파일 경로 기반 그룹핑(bippy `getSource`)** — 채택. 근거는 아래 결정 참고.
- **트리 depth 기반 도메인 추정** — 검토했으나 시도하지 않음. exp2(ADR-0006)가 이미 "부모-자식이 다른 그룹에 속할 수 있음"을 발견해, depth만으로는 도메인 경계를 특정할 수 없음이 선행 실험에서 드러나 있었다.
- **개발자 수동 그룹 지정 API** — 이번 스코프에서는 불필요하다고 판단. 아래처럼 자동 추출이 dev 빌드에서 충분히 안정적으로 동작함을 확인했기 때문. 다만 자동 추출이 실패하는 예외 케이스(익명 인라인 컴포넌트 등)를 위한 보조 수단으로는 향후 가치가 있다 — 별도 사안으로 남겨둔다.

## 결정

**소스 파일 경로 기반 그룹핑 힌트는 가능하다 — 단, dev 빌드 전용으로 범위를 좁혀서 확정한다.**

### 1. 문서와 실제 API가 다시 어긋나 있었다

technical-options.md와 bippy README는 `getFiberSource`를 언급하지만, 실제 설치된 bippy 0.6.0의 `bippy/source` 서브패스가 export하는 함수 이름은 `getSource`다(`getFiberSource`는 README에만 존재하고 `dist/*.d.ts` 어디에도 없음 — `grep -rl "getFiberSource" node_modules/bippy`는 `README.md` 한 곳만 히트). ADR-0005의 `secure()` 사례와 동일한 패턴이 반복됐다. 시그니처: `getSource(fiber, cache?, fetchFn?) => Promise<{ fileName, lineNumber, columnNumber, functionName } | null>`, composite fiber 전용, "dev 전용으로 사용 가능"이라고 타입 주석에 명시돼 있다.

### 2. Dev 빌드: 안정적으로 동작하고, 실제로는 "사용 위치"를 준다

Vite dev 서버에서 실제 사용자 컴포넌트(App, ThemedLabel, Counter, ItemList, ListItem×3) 7/7 모두 정확한 `fileName`+`lineNumber`를 받았다. 부가 발견: bippy의 `isCompositeFiber`는 exp1(ADR-0005)이 겪은 익명 Provider/Consumer wrapper Fiber를 애초에 "composite"로 분류하지 않아, `getSource` 호출 대상에서 자동으로 빠진다 — 익명 Fiber 필터링을 그룹핑 파이프라인 단에서 한 번 더 자연스럽게 해결해준다.

멀티파일 fixture(`shared/Button.tsx`를 `checkout/CheckoutPanel.tsx`가 렌더)로 교차 파일 케이스를 확인한 결과, `Button` fiber의 `fileName`은 `Button.tsx`(정의 위치)가 아니라 `CheckoutPanel.tsx`(그 JSX가 실제로 쓰인 위치)로 나왔다. 이는 `getSource`의 문서 설명("returns the source of where the component is used")과 일치하며, exp2(ADR-0006)가 발견한 "부모-자식이 다른 그룹에 속할 수 있음"과도 방향이 맞다 — 공유 컴포넌트는 그것을 쓰는 도메인 쪽으로 그룹핑되는 게 오히려 목적에 부합한다.

### 3. Production 빌드: 소스맵 유무와 무관하게 신뢰할 수 없다

**소스맵 없이 빌드(vite 기본값)** — `displayName` 자체가 minify된 이름(`bn`, `Cn`, `xn` 등)으로 나오고, 모든 컴포넌트의 `fileName`이 번들 JS 하나의 URL로 수렴한다(9개 중 7개가 "성공"으로 잡혔지만 전부 같은 파일이라 그룹핑 정보로는 무의미). 이건 "실패"조차 아니고 "전부 같은 그룹"이라는, 조용히 틀린 결과라 더 위험하다.

**소스맵을 켜고(`build.sourcemap: true`) preview 서버로 `.map`을 fetch 가능하게 한 경우** — `fileName`이 실제 원본 경로(`../../src/App.tsx`, `../../src/domains/shared/Button.tsx`)로 복원된다. 그런데 두 가지 문제가 남는다:
  - **의미가 dev와 달라진다.** dev에서는 "사용 위치"를 주지만, prod 폴백 경로(React 19의 `_debugStack`이 프로덕션 빌드에서 제거되므로 "owner-stack 스로잉 트릭"으로 폴백)에서는 `Button`의 `fileName`이 이번엔 `Button.tsx`(정의 위치)로 나왔다 — 같은 필드가 빌드 모드에 따라 다른 의미를 갖는다.
  - **props/hooks가 없는 컴포넌트는 완전히 실패한다.** `App`과 `CheckoutPanel`(둘 다 props 미사용, hook 미사용, 자식만 렌더하는 순수 wrapper)은 `getSource`가 `null`을 반환했다. 스로잉 트릭이 가로챌 지점(hook 호출, props 접근)이 없기 때문으로 보인다. 하필 이런 "섹션/레이아웃 wrapper" 컴포넌트가 도메인 경계 역할을 가장 많이 할 후보인데, 정확히 이 케이스가 production에서 깨진다.
  - 그 외에도 소스맵 자체가 번들보다 4배 이상 크고(테스트 빌드에서 214KB 번들에 921KB 맵), 대다수 실서비스는 소스 노출 우려로 공개 소스맵을 배포하지 않거나 에러 트래킹 전용의 비공개 위치에만 올려 클라이언트에서 fetch 불가능하게 한다 — 이 경로 자체가 열려 있지 않은 배포가 흔하다.

### 4. 범위를 dev 전용으로 좁혀서 확정한다

architecture.md의 설계 원칙 1번("devtools-only 실행")을 다시 보면, 이 프로젝트는 애초에 프로덕션 빌드에서 계측 자체를 걸지 않는다(exp1의 `startFiberInspector()`가 `import.meta.env.DEV`로 가드된 것과 동일). 즉 "그룹핑 힌트가 production에서 안 됨"은 이 프로젝트의 1순위 유스케이스(개발자가 자기 dev 환경에 붙여 쓰는 도구)를 막지 않는다. production 지원이 실제로 필요해지는 시점(예: 배포된 스테이징 환경 디버깅)이 오면 그때 별도 ADR로 재검토한다.

**확정 사항:**
- 그룹핑 힌트는 `bippy/source`의 `getSource(fiber)`가 반환하는 `fileName`을 쓴다. dev 빌드에서만 호출한다.
- 그룹핑 힌트의 의미는 "컴포넌트가 정의된 파일"이 아니라 **"그 컴포넌트의 JSX가 렌더(사용)된 파일"**로 명시한다. architecture.md의 "소스 파일 경로"라는 표현이 모호했으므로 이번에 고정한다.
- `getSource`는 async이므로 그룹핑 힌트는 커밋 시점에 동기적으로 채워지지 않고 이후 갱신되는 필드로 데이터 레이어 스키마에 반영한다(값이 잠깐 비어 있다가 채워질 수 있음을 시각화 레이어가 감안해야 함).
- props/hooks 없는 순수 wrapper 컴포넌트의 해석 실패는 dev 빌드(React 19 `_debugStack` 경로)에서는 재현되지 않았다 — App, CheckoutPanel 모두 dev에서는 정상적으로 해석됐다. dev 전용으로 범위를 좁힌 결정 덕분에 이 실패 케이스 자체가 사라진다.

## 예상 밖 발견 (기록해 둘 것)

- **README의 `getFiberSource`는 실제로 존재한 적 없는 이름이다(0.6.0 기준).** 실제 export는 `getSource`. ADR-0005의 `secure()` 건과 합쳐 두 번째 문서-코드 드리프트 사례 — bippy를 계속 채택한다면(ADR-0002), **버전을 올릴 때마다 사용 중인 API를 실제 `.d.ts`로 재확인하는 습관을 프로젝트 규칙으로 못박을 가치가 있다.**
- **그룹핑 힌트의 의미(사용 위치 vs 정의 위치)가 dev/prod 사이에서 뒤바뀐다.** 이번 검증에서 가장 위험했던 부분 — 만약 dev 전용으로 좁히지 않고 prod 폴백까지 같은 스키마 필드로 썼다면, 빌드 모드에 따라 같은 필드가 다른 걸 의미하는 조용한 버그가 됐을 것.
- **소스맵 없는 프로덕션 빌드는 "실패"가 아니라 "전부 같은 그룹"이라는 조용히 틀린 결과를 준다.** null이나 에러였다면 오히려 안전했을 것 — 이 실패 모드는 그룹핑 힌트를 프로덕션에서 절대 신뢰해서는 안 된다는 근거를 더 강하게 만든다.
- **bippy의 `isCompositeFiber`가 exp1의 "익명 Fiber" 문제를 부분적으로 대신 해결해준다.** exp2(ADR-0006)의 `preprocessFiberTree()`가 직접 구현한 필터링과 별개로, `getSource` 호출 대상을 고를 때 `isCompositeFiber`를 쓰면 Provider/Consumer 래퍼가 애초에 후보에서 빠진다 — 두 필터링 로직(exp2의 displayName 기반, 이번 실험의 tag 기반)을 라이브 MVP에서 어떻게 합칠지는 추가 설계가 필요하다.
- `getDisplayNameFromSource`, `getParentStack`/`getOwnerStack`, `symbolicateStack`/`getSourceMap` 같은 `bippy/source`의 다른 export는 이번엔 검증하지 않았다 — prod에서 mangled된 `displayName`을 소스맵으로 복원할 수 있는지는 미검증 상태로 남는다(어차피 그룹핑 힌트를 dev 전용으로 확정했으므로 이번 결정에는 영향 없음).

## 결과

- **architecture.md 데이터 레이어 섹션의 "그룹핑 힌트" 항목을 이 결정에 맞게 구체화한다**(의미를 "사용 위치"로 고정, dev 빌드 전용 명시, async 필드임을 명시).
- roadmap.md의 "라이브 MVP" 항목 아래에 이 검증 완료를 기록한다.
- 이 실험의 코드(`experiments/exp1-fiber-extraction/src/source-spike.ts`, `src/domains/`)는 스파이크 코드이며 라이브 MVP에 그대로 재사용할 필요는 없다 — 다만 위 발견들(특히 사용 위치/정의 위치 의미 차이, dev 전용 범위 확정)은 다음 단계 설계에 반영한다.
- 이 검증이 라이브 MVP 통합 프롬프트를 확정하기 전 마지막 미검증 사항이었다. 이제 실험 1(기술 가능성) + 실험 2(UI 철학) + 이 검증(그룹핑 힌트) 모두 완료됐으므로 통합 프롬프트를 작성할 수 있다.
