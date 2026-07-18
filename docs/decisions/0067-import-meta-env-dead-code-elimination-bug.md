# ADR-0067: `import.meta.env.DEV` 트리셰이킹 버그 — 배포된 모든 버전에서 Alt+클릭/더블클릭/hover가 죽어있었다

- 상태: 채택됨(구현, 중대 결함 수정)
- 날짜: 2026-07-19

## 맥락

실사용 프로젝트(그리디 홈페이지)에서 사용자가 직접 지적했다: 더블클릭으로 실제 화면 요소를 스크롤+하이라이트하는 기능(ADR-0043)도, Alt+클릭으로 실제 화면 요소에서 보드 노드로 이동하는 역방향 인터랙션(ADR-0024/0026)도 전혀 동작하지 않았다. "전체 기능의 50%가 안 되는데 왜 된다고 했냐"는 정당한 지적이었다.

## 원인

`src/hooking/domInteraction.ts`의 `startDomClickBridge`와 `src/hooking/fiberInspector.ts`의 `startFiberInspector`가 각각 자체적으로 다음 패턴의 dev 전용 가드를 갖고 있었다:

```ts
export function startDomClickBridge(...) {
  if (!import.meta.env.DEV) {
    return () => {};
  }
  // ... 실제 로직(Alt+클릭, hover-follow, 더블클릭이 의존하는 findFiberIdForElement 등) ...
}
```

`import.meta.env.DEV`는 **Vite가 빌드 시점에 정적으로 치환**하는 값이다. 문제는 이 파일들이 **라이브러리 자체(`dist-lib`)로 빌드될 때도 Vite를 거친다**는 점이다 — `npm run build:lib`(`vite build --config vite.lib.config.ts`)는 순수 **프로덕션 빌드**이고, Vite는 프로덕션 빌드에서 `import.meta.env.DEV`를 항상 리터럴 `false`로 치환한다. 그러면:

```js
if (!false) return () => {};  // 항상 참으로 확정됨
// ↓ Rollup/esbuild가 이 아래 전부를 "도달 불가능한 죽은 코드"로 판단해 트리셰이킹
```

**실제로 컴파일된 `dist-lib`를 직접 열어 확인한 결과, `startDomClickBridge`/`startFiberInspector`의 진짜 로직(이벤트 리스너 등록, Alt 키 처리, hover-follow, `findFiberIdForElement` 호출 등)이 통째로 사라져 있었다.** 이건 **이번 세션에서 새로 생긴 버그가 아니라, 이 함수들이 처음 작성된 이후(ADR-0024/0026/0038) 배포된 모든 npm 버전에 처음부터 있던 결함**이었다 — Vite/Turbopack/webpack 어떤 소비자 환경이든 상관없이, `react-render-board`를 설치한 그 누구도 이 두 기능을 한 번도 정상적으로 써본 적이 없었다.

(주입 런타임의 진입점인 `src/inject.tsx`는 이 문제를 이미 [ADR-0036](0036-distribution-connection-implementation.md) 구현 과정에서 `isDevEnvironment()`라는 자체 헬퍼로 피해갔지만, `domInteraction.ts`/`fiberInspector.ts`는 그 수정에서 빠져 있었다 — 같은 클래스의 버그가 같은 파일 세트 안에 부분적으로만 고쳐진 채 남아있었던 것.)

## 결정

`isDevEnvironment()`를 `src/hooking/devEnvironment.ts`로 뽑아 공유 유틸로 만들고, `src/inject.tsx`·`domInteraction.ts`·`fiberInspector.ts` 셋 다 이걸 쓰도록 통일했다:

```ts
export function isDevEnvironment(): boolean {
  // (a) 주입 레이어가 세우는 순수 런타임 프로퍼티 — import.meta를 안 건드려 정적 치환에 안 걸린다.
  if (typeof window !== 'undefined' && window.__RRB_DEV__ === true) return true;
  // (b) Vite dev 소스(이 저장소 자신의 npm run dev처럼, 빌드 안 되고 그대로 소비되는 경우).
  try {
    const viteEnv = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
    if (viteEnv?.DEV === true) return true;
  } catch { /* import.meta.env 미지원 환경 */ }
  // (c) Next/webpack dev 서버(process.env.NODE_ENV).
  const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
  const nodeEnv = proc?.env?.NODE_ENV;
  if (typeof nodeEnv === 'string' && nodeEnv !== 'production') return true;
  return false;
}
```

핵심은 (a) — `window.__RRB_DEV__`는 `import.meta`를 전혀 참조하지 않는 순수 런타임 프로퍼티 접근이라, Vite가 아무리 프로덕션 빌드를 해도 정적으로 값을 알 수 없어 **절대 트리셰이킹 대상이 되지 않는다.** 이 신호는 주입 레이어(`cli/vite.mjs`, `cli/next.mjs`, `cli/webpack.cjs`)가 dev 서버에서만 세운다.

## 검증

1. **버그 재현**: 수정 전 `dist-lib`를 직접 열어 `startDomClickBridge`의 실제 로직(문자열 `'mousemove'`, `'keydown'` 등)이 컴파일된 청크 어디에도 없음을 확인.
2. **단위 테스트**: `devEnvironment.test.ts` 신규 + `domInteraction.test.ts`/`fiberInspector.test.ts`의 "dev 아닐 때 no-op" 테스트를 `vi.mock('./devEnvironment', ...)`로 재작성(vitest가 이미 트랜스파일된 타 모듈의 `import.meta.env`를 `vi.stubEnv`로 안정적으로 재현 못 하는 한계를 발견해 우회). 전체 342개 테스트 통과.
3. **컴파일 출력 재확인**: 수정 후 `dist-lib`를 다시 열어 `mousemove`/`keydown`/`preventDefault`/`requestNavigate` 등 실제 로직이 온전히 살아있음을 직접 확인.
4. **실사용 프로젝트 실측**: 그리디 홈페이지(Next 16 + Turbopack, react-scan 병행)에 반영 후 Playwright로 —
   - Alt+클릭: 패널이 닫힌 상태에서 실제 페이지 요소를 Alt+클릭 → 보드가 자동으로 열림 확인.
   - 더블클릭: 보드 노드를 더블클릭 → 실제 화면에 하이라이트 박스 2개 렌더 확인.
   - 콘솔 에러 0건.

## 결과

- **`domInteraction.ts`/`fiberInspector.ts`가 쓰던 각자의 `import.meta.env.DEV` 체크를 전부 `isDevEnvironment()`로 교체** — 더 이상 개별 파일이 이 패턴을 직접 쓰지 않는다.
- **영향 범위**: 주입 런타임(`react-render-board/inject`, 대다수 사용자가 쓰는 경로)의 Alt+클릭/더블클릭/hover-follow **전부** 복구. 라이브러리 API로 `startFiberInspector`를 직접 쓰는 소수의 수동 통합 사용자도 함께 복구.
- **아직 배포 안 됨** — 이 수정은 로컬 소스 + 실사용자 프로젝트의 `node_modules` 핫픽스로만 반영돼 있다. 정식 배포(`npm publish`, 버전 올림)는 별도로 필요하다.
- **교훈**: "dev 전용 가드"류 패턴은 **파일 하나하나 개별적으로가 아니라 프로젝트 전체에서 grep으로 훑어 한 번에 통일**해야 한다 — 이번에 `src/inject.tsx`만 고치고 같은 문제를 가진 다른 두 파일을 놓친 채 한 세션을 그냥 넘겼다. 비슷한 정적 치환 위험이 있는 패턴(`process.env.NODE_ENV` 직접 비교 등)이 이 코드베이스 다른 곳에도 남아있는지 별도로 감사할 가치가 있다(스코프 밖으로 남김).

## 관련
- [ADR-0036](0036-distribution-connection-implementation.md)(주입 런타임의 최초 `isDevEnvironment()`) · [ADR-0024](0024-board-dom-bidirectional-interaction.md)/[ADR-0026](0026-bidirectional-interaction-implementation.md)(양방향 인터랙션 원 구현) · [ADR-0043](0043-double-click-reveal-in-real-page.md)(더블클릭 원 구현) · [ADR-0065](0065-hook-this-binding-bug-fix.md)(같은 실사용 세션에서 발견된 별개의 훅 버그)
