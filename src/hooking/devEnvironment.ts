// dev 전용 판별을 번들러 무관하게 한다(ADR-0067 버그 수정). import.meta.env.DEV는 Vite 전용이고,
// 무엇보다 **이 파일 자체가 Vite로 빌드되는 dist-lib에 번들된다** — `npm run build:lib`(순수
// `vite build`, production 모드)이 `import.meta.env.DEV`를 빌드 시점에 리터럴 `false`로
// 정적 치환해버리므로, `if (!import.meta.env.DEV) return` 형태의 코드는 "항상 참"으로 확정돼
// 그 뒤 코드 전체가 죽은 코드로 트리셰이킹된다 — 실제로 startDomClickBridge/startFiberInspector가
// 이 패턴 때문에 컴파일된 dist-lib에서 통째로 사라져 있었다(Alt+클릭 역방향 인터랙션과 hover
// 프리뷰가 어떤 소비자 환경에서도 한 번도 동작하지 않았던 근본 원인 — 실사용 프로젝트에서 발견).
//
// 그래서 두 신호를 함께 본다: (a) 주입 레이어(cli/vite.mjs, cli/next.mjs, cli/webpack.cjs)가
// 세우는 명시적 __RRB_DEV__ 플래그 — import.meta를 안 건드리는 순수 런타임 체크라 Vite의 정적
// 치환에 안 걸리고, 미리 빌드된 dist-lib에서도 항상 올바르게 동작한다. (b) import.meta.env.DEV —
// 이 소스 파일이 "빌드되지 않고 그대로" 소비되는 경우(이 저장소 자신의 `npm run dev` 데모처럼
// Vite dev 서버가 이 파일을 직접 트랜스파일하는 경우, 정적 치환이 아니라 진짜 dev 서버 값)에만
// 의미가 있다. (c) globalThis.process.env.NODE_ENV — Next/webpack dev 서버 환경. 어느 한쪽이라도
// dev면 dev로 본다.
export function isDevEnvironment(): boolean {
  // (a) 주입 레이어가 세운 명시 신호 — 가장 신뢰 가능(위 주석 참고).
  if (typeof window !== 'undefined' && window.__RRB_DEV__ === true) return true;
  // (b) Vite dev 소스: import.meta.env.DEV.
  try {
    const viteEnv = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
    if (viteEnv?.DEV === true) return true;
  } catch { /* import.meta.env 미지원 환경 */ }
  // (c) process가 실제 전역인 dev 서버 환경.
  const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
  const nodeEnv = proc?.env?.NODE_ENV;
  if (typeof nodeEnv === 'string' && nodeEnv !== 'production') return true;
  return false;
}

declare global {
  interface Window {
    // 주입 레이어(dev에서만 실행됨)가 세우는 dev 신호 — src/inject.tsx의 부트 시점에도 같은
    // 선언을 공유한다(중복 declare global은 병합되므로 안전).
    __RRB_DEV__?: boolean;
  }
}
