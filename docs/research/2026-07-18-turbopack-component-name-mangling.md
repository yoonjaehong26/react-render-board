# Turbopack dev에서 컴포넌트 이름이 "c8"/"eS"로 뜨는 문제 — 원인 조사

> 2026-07-18. 실사용 프로젝트(greedy-homepage-fe, Next 16.2.10 + Turbopack + React 19.2.4)에서
> 보드의 컴포넌트 이름이 "c8"·"eS"·"nd" 같은 압축 식별자로 표시되는 문제
> ([project-status §7-3](../project-status.md) 미해결 항목)의 원인 조사 기록.
> `fiber.type.name` 자체가 이 값임은 이미 확인됐다(표시 로직 문제 아님).

## 결론 요약

1. **기본 `next dev`(Turbopack)는 앱 소스의 함수 이름을 망글링하지 않는다** — Next 16.2.10 +
   React 19.2.4 최소 재현앱으로 직접 검증(클라이언트/서버 청크 모두 `function ClientCounter`,
   `function RootLayout` 원형 보존). "Turbopack이 dev 컴파일에서 이름을 압축한다"던 기존 추정은
   **일반론으로는 틀렸다.**
2. dev에서 망글링을 만드는 유일하게 재현된 경로는 `next.config`의
   **`experimental.turbopackMinify: true`** — dev/build 공용 플래그라 켜면 dev 번들에도 SWC
   미니파이어(식별자 mangling)가 적용된다. "c8"/"eS" 같은 2문자 이름은 SWC mangler 출력 패턴과
   일치. 단, **greedy-homepage-fe의 `next.config.ts`에는 이 플래그가 없다**(turbopack.root와
   images뿐) — 그러므로 이 앱의 원인은 이게 아니다.
3. greedy의 dependencies는 next/react/react-dom + 유틸(clsx·cva·pretendard)뿐 — **서드파티
   컴포넌트 라이브러리의 사전 미니파이 배포물 가설도 배제.**
4. 남은 유력 가설(미검증): **압축 이름 fiber들은 앱 컴포넌트가 아니라 Next 프레임워크 내부
   컴포넌트다.** Next는 자기 런타임을 `next/dist/compiled/*`에 사전 컴파일(일부 미니파이)로
   배포하므로, 소스 몇 개짜리 작은 앱에서는 트리의 상당수가 Next 내부(라우터·에러 바운더리·
   RSC 런타임 등) fiber라 압축 이름이 눈에 띄게 많이 보일 수 있다. 다음 실사용 세션에서
   "압축 이름 fiber가 정확히 어느 모듈 소속인지"를 런타임에서 확인해야 한다(아래 진단 절차).

## 재현 실험 (Next 16.2.10 + React 19.2.4 최소 앱)

| 조건 | 클라이언트 청크 | 서버(SSR) 청크 |
|---|---|---|
| 기본 `next dev` | `function ClientCounter` 보존 | `function RootLayout` 보존 |
| `experimental.turbopackMinify: true` | **망글링**(`function n(...)`) | **망글링**(원명은 `.js.map`에만) |
| `NODE_ENV=production next dev` | 보존(기본과 동일) | 보존 |

- 공식 문서([Turbopack API Reference](https://nextjs.org/docs/app/api-reference/turbopack)) 기본값:
  `turbopackMinify` dev `false`/build `true`, `turbopackScopeHoisting`은 dev 항상 비활성.
  React Compiler도 16.2에선 기본 비활성 — 즉 scope hoisting·컴파일러는 원인 후보에서 제외.
- 망글링 상태에서도 `jsxDEV` + `fileName/lineNumber` 디버그 정보는 남는다 — "dev인데 이름만
  압축"이라는 관찰과 정합.

## 전용 GitHub 이슈는 미발견, 주변 증거만

- 전용 이슈("Turbopack dev에서 컴포넌트 이름 망글링") 미검출(발견 실패이지 부재 단정 아님).
- [vercel/next.js PR #88453](https://github.com/vercel/next.js/pull/88453)(open) — 스택트레이스의
  망글링된 함수명 복원(deobfuscate) 시도. [PR #87911](https://github.com/vercel/next.js/pull/87911)
  (merged) — 소스맵 `names` 필드를 채움(원명 복원 채널).
- [react-scan PR #189](https://github.com/aidenybai/react-scan/pull/189) — 같은 문제를 빌드타임
  `displayName` 주입 로더(unplugin, webpack/vite/turbopack 지원)로 해결한 선례.
- Turbopack 소스맵 자체 버그도 열려 있음([#93462](https://github.com/vercel/next.js/issues/93462)
  invalid VLQ, [#88294](https://github.com/vercel/next.js/issues/88294) wrong filename) — getSource
  기반 그룹 이름 해석이 이 앱에서 "확인 중…"에 멈추는 것과 연관 가능(추정).

## 우회책 후보 (모두 미착수)

- **앱 사용자 측**: config에 `turbopackMinify: true`가 있는 경우에 한해 제거가 즉효.
  greedy에는 해당 없음.
- **라이브러리 측 A — Fast Refresh 레지스트리 후킹(유망, dev+클라이언트 한정)**: 미니파이된
  청크에서도 `__turbopack_context__.k.register(fn, "원본이름")` → `$RefreshReg$`로 **원본 이름이
  문자열로 흘러가는 것을 재현에서 확인**. 조기 훅이 `$RefreshReg$`(또는
  `$RefreshInterceptModuleExecution$`)를 래핑해 `WeakMap<fn, 이름>`을 쌓으면 `fiber.type` → 원명
  복원 가능. ⚠️ 단 이는 조기 훅이 전역 함수를 또 하나 래핑하는 일이라, react-scan 다중 리스너
  시도가 무한 재귀 사고를 냈던 전례(ADR-0065)를 반드시 되짚고 재귀 가드를 갖춘 뒤에만 시도할 것.
- **라이브러리 측 B — 소스맵 `names` 복원**: dev는 `turbopackSourceMaps` 기본 on이라 `.map`에
  원명이 있음을 확인. 함수 위치→names 매핑 구현 비용이 커서 후순위.
- **React DevTools는 참고 답안이 아님**: devtools의 `getDisplayName`도
  `displayName → name → 'Anonymous'`만 본다(소스맵/Refresh 미사용) — 같은 앱에서 DevTools도
  똑같이 압축 이름을 보여줄 것. "우리만 못 푸는 문제"가 아니라 생태계 공통 문제.

## 다음 실사용 세션에서 할 진단 (가설 4 검증)

greedy 앱을 띄운 상태에서 콘솔에 아래를 실행해 "압축 이름 fiber의 정체"를 밝힌다:

```js
// 압축 이름(<=3자) 컴포넌트 fiber를 모아 함수 소스 앞부분을 덤프 — Next 내부인지 앱 소스인지 판별
const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
const roots = [...hook.getFiberRoots(1)];
const out = [];
(function walk(f) {
  if (!f) return;
  if (typeof f.type === 'function' && f.type.name && f.type.name.length <= 3)
    out.push({ name: f.type.name, src: String(f.type).slice(0, 120) });
  walk(f.child); walk(f.sibling);
})(roots[0].current.child);
console.table(out);
```

- 함수 소스가 미니파이 형태(한 줄, 압축 식별자)면 = 사전 컴파일된 Next 내부 → **우리 버그 아님**,
  host 숨김처럼 "프레임워크 내부 접기/뱃지" 같은 표시 정책 문제로 전환.
- 함수 소스가 앱 코드(RootLayout 등) 원형이면 = 정말 컴파일에서 이름이 사라진 것 → 재현앱과의
  차이(버전·플래그)를 좁혀 별도 이슈 리포트 후보.

재현 코드는 세션 스크래치패드(`next-mangle-repro/`)에만 있고 커밋하지 않았다 — 재현 방법은 위
표의 조건 그대로(create-next-app 최소앱 + 플래그 토글)라 재구성 비용이 낮다.
