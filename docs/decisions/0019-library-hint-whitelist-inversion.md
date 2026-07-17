# ADR-0019: P4 — 그룹핑 노이즈 판별 커버리지 (화이트리스트 반전)

- 상태: 채택됨
- 날짜: 2026-07-17

## 맥락

ADR-0015가 발견한 문제다. ADR-0012의 `isLibraryInternalHint`는 `groupHint`가 `node_modules` **리터럴 문자열**을 포함하는지로 라이브러리 내부 경로를 판별했는데, Vite의 의존성 프리번들 캐시(`node_modules/.vite/deps/`)가 만드는 소스맵은 `sources`를 그 캐시 디렉터리 기준 **상대경로**로 적어 `node_modules` 세그먼트 자체가 사라진다 — `../../@radix-ui/react-dropdown-menu/dist/index.mjs`(shadcn-admin), `../../@mui/material/esm/styles/ThemeProvider.js`(berry-admin) 같은 형태. ADR-0012의 흡수 메커니즘(`resolveEffectiveGroups`가 조상 체인을 타고 올라가 가장 가까운 앱 소스 그룹으로 합침) 자체는 정상 동작하지만, 이 판별 조건의 커버리지가 좁아 트리거되지 않는 게 문제다.

## 검토한 대안

- **(a) 알려진 패키지 스코프/이름 패턴을 화이트리스트/블랙리스트로 계속 추가한다** — 기각. `@radix-ui`, `@mui`, `@emotion`, `framer-motion`, `react-router`, `@tanstack` 등 매번 새 라이브러리가 나올 때마다 패턴을 추가해야 하는 두더지 잡기식 접근이라 근본 해결이 아니다.
- **(b) 프로젝트 소스 루트 밖 경로를 전부 라이브러리로 간주하는 화이트리스트 반전** — 채택(사용자 지시 방향과 일치).

## 결정

`src/visualization/lib/groups.ts`의 `isLibraryInternalHint`에 두 번째 조건을 추가했다:

```ts
export function isLibraryInternalHint(groupHint: string): boolean {
  if (/(^|[/\\])node_modules[/\\]/.test(groupHint)) return true; // 기존 리터럴 매칭, 유효한 하위 케이스로 유지.
  if (/^\.\.[/\\]/.test(groupHint)) return true; // 상위 디렉터리 이탈 = 프로젝트 소스 루트 밖.
  return false;
}
```

**"프로젝트 소스 루트"를 실제 파일시스템 경로로 직접 아는 방법이 시각화 레이어에는 없다** — `groupHint`는 브라우저에서 `getSource`가 돌려주는 문자열뿐이다. 대신 지금까지 실측한 4개 앱(자체 fixture, excalidraw, shadcn-admin, berry-admin) 전부에서 관찰된 일관된 패턴을 화이트리스트 반전의 판별 기준으로 삼았다: **앱 소스 `groupHint`는 예외 없이 파일명만(상위 디렉터리로 거슬러 올라가는 접두사 없이) 나왔고, 라이브러리 프리번들 캐시 경로는 예외 없이 `../`로 시작했다.** 이는 각 파일 자신의 소스맵 `sources` 항목이 보통 자기 자신을 가리키는 상대경로(=디렉터리 이동이 필요 없음)인 반면, 프리번들 캐시의 소스맵은 캐시 디렉터리 "밖"의 실제 `node_modules` 위치를 가리켜야 해서(=상위로 거슬러 올라가야 함) 구조적으로 다르기 때문으로 보인다.

## 근거

세 개의 재현 스크립트로 검증했다: `scripts/verify-real-app.mjs`(excalidraw — ADR-0012가 이미 고쳤던 사례의 회귀 여부), `scripts/verify-real-app-shadcn-admin.mjs`(shadcn-admin — ADR-0015가 새로 발견한 사례), `scripts/verify-routing.mjs`(berry-admin — ADR-0015가 새로 발견한 사례, 특히 login 라우트).

## 결과

**수정 전/후 그룹 수·노이즈 비율 비교**

| 앱 / 시나리오 | 수정 전 그룹 수 | 수정 전 노이즈 | 수정 후 그룹 수 | 수정 후 노이즈 |
|---|---|---|---|---|
| excalidraw (도형 3개, ADR-0012 기준) | 67~68 | 0개(0%) — 이미 해결된 사례 | 67 | **0개(0%) — 회귀 없음 확인** |
| shadcn-admin `/users?pageSize=100` | 9 | 5개(`../../@radix-ui/...` 4종 + `node_modules` 없이 새는 경로들) | **49** | **1개(2%)** — 아래 "알려진 예외" 참고 |
| berry-admin dashboard | 74 | 다수(`../../@mui/...`, `../../@emotion/...`, `../../framer-motion/...` 등이 8개 미리보기 슬롯을 전부 채울 정도) | **16** | **0개(0%)** |
| berry-admin login(Auth 트리) | 45 | 다수(ADR-0015가 "44개 그룹 중 다수가 라이브러리 내부 파일" 이라 기록한 바로 그 사례) | **10** | **0개(0%)** |

- **그룹 노이즈가 사실상 해소됐다.** berry-admin은 dashboard 74→16개, login 45→10개로 그룹 수 자체가 4~5배 줄었고, 남은 그룹은 전부 `ConfigContext.jsx`/`App.jsx`/`Login.jsx`/`AuthCardWrapper.jsx`처럼 실제 앱 소스 파일이었다.
- **shadcn-admin에 예외 1건이 남았다 — 의도된 폴백 동작이다.** `../../@tanstack/react-query/build/modern/QueryClientProvider.js`가 여전히 별도 그룹으로 노출된다. 원인은 판별 로직의 누락이 아니라 `resolveEffectiveGroups`의 기존(ADR-0012) 폴백 규칙이다: 조상 체인 전체가 라이브러리 힌트로만 이뤄져 트리 루트까지 앱 소스 조상을 하나도 못 찾으면, 완전한 정보 손실보다 라이브러리 힌트라도 쓰는 쪽을 택한다. 즉 이 특정 컴포넌트는 QueryClientProvider부터 루트까지 이어지는 조상 전부가 라이브러리 내부 조합이라 흡수될 곳이 없다 — 이번 ADR이 고치는 "판별 커버리지" 문제가 아니라 별도로 알려진, 문서화된 극단 케이스다.
- **P2(ADR-0018)의 라벨 겹침 완화에도 기여했다.** 그룹 수가 4~5배 줄면서 지도 모드에서 라벨이 차지하는 밀도도 그만큼 낮아졌다 — ADR-0018이 "알려진 한계"로 남긴 declutter 문제를 완전히 없애지는 못했지만 상당히 누그러뜨렸다.

이 수정은 판별 조건 하나를 추가한 국소적 변경이라 되돌리기 쉽다.
