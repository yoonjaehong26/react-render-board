// 배포/설치 "연결 방식"의 브라우저 런타임 진입점 (ADR-0020/0021/0036).
//
// 번들러 플러그인(cli/vite.mjs 등)이 대상 앱의 <head>에 이 모듈을 주입하면, 앱 소스를
// 단 한 줄도 안 건드리고 라이브 보드가 뜬다. src/main.tsx가 데모 앱에 대해 수동으로
// 하는 배선(store/interactionStore 생성 → 훅 설치 → BoardOverlay 마운트)을, "대상 앱을
// 미리 모르는" 주입 상황에 맞게 일반화한 것이다.
//
// dev 전용 가드(요구사항 3, architecture.md 원칙 1 — React-Sight가 프로덕션 사이트를
// 정지시켜 죽은 지점): import.meta.env.DEV가 아니면 아무것도 하지 않는다. 번들러 플러그인도
// dev 서버에서만 주입한다(cli/vite.mjs의 apply:'serve') — 즉 프로덕션 주입은 "빌드에 아예
// 안 들어감(플러그인)" + "들어가도 no-op(이 가드)" 이중 방어다.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { instrument, type FiberRoot } from 'bippy';
import { createRenderStore } from './data/store';
import { createInteractionStore } from './visualization/lib/interactionStore';
import { startDomClickBridge } from './hooking/domInteraction';
import { BoardOverlay } from './visualization/BoardOverlay';

declare global {
  interface Window {
    __RRB_BOOTED__?: boolean;
    // 주입 레이어(dev에서만 실행됨)가 세우는 dev 신호. 번들러 플러그인이 이미 프로덕션을
    // 막으므로(Vite apply:'serve', Next process.env.NODE_ENV 가드) 이 플래그가 서 있다는 것
    // 자체가 "지금 dev"라는 신뢰 가능한 신호다. 미리 빌드된 lib에서 import.meta.env.DEV가
    // false로 굳거나 Next 브라우저에서 process가 실제 전역이 아닌 문제를 우회한다.
    __RRB_DEV__?: boolean;
    // 번들러 플러그인이 대상 앱 root보다 먼저 심는 조기 훅이, 주입 런타임이 부팅되기 전에
    // 일어난 커밋(예: Next에서 클라이언트 하이드레이션까지의 초기 마운트)을 버퍼링해 둔다.
    // rendererID → 최신 FiberRoot. Vite처럼 런타임이 앱보다 먼저 뜨는 경우엔 없어도 된다.
    __RRB_ROOTS__?: Map<number, { current: unknown; containerInfo?: Node }>;
  }
}

// dev 전용 판별을 번들러 무관하게 한다(요구사항 3). import.meta.env.DEV는 Vite 전용이고,
// 미리 빌드된 lib에선 false로 굳거나 Next에선 import.meta.env 자체가 없어서 단독으론 못 쓴다.
// 그래서 두 신호를 함께 본다: (a) Vite dev 소스의 import.meta.env.DEV, (b) globalThis.process의
// NODE_ENV(Next/webpack) — globalThis 경유로 접근해 번들러의 process.env.NODE_ENV 정적 치환을
// 피한다. 어느 한쪽이라도 dev면 dev로 본다. 주입 레이어(Vite apply:'serve', Next의 layout
// process.env.NODE_ENV 가드)가 이미 프로덕션을 막으므로 이 런타임 가드는 이중 방어다.
function isDevEnvironment(): boolean {
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

export function bootRenderBoard(): void {
  // dev 전용 (프로덕션 주입 금지 — architecture.md 원칙 1, React-Sight 실패 지점).
  if (!isDevEnvironment()) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  // HMR/중복 주입(여러 진입점, 새로고침 없는 리로드)에서 보드가 두 번 뜨지 않게 한다.
  if (window.__RRB_BOOTED__) return;
  window.__RRB_BOOTED__ = true;

  const store = createRenderStore();
  const interactionStore = createInteractionStore();

  // 보드 자신도 React로 그려지므로, instrument()가 거는 페이지 전역 훅은 보드 자신의
  // 커밋까지 관찰해버린다. src/main.tsx는 subjectContainer를 미리 알아서 "그 컨테이너의
  // 커밋만 포함(include-only)"으로 걸지만(hooking/fiberInspector.ts), 주입 모드는 대상 앱
  // root가 어디에 마운트될지 모른다 — 그래서 필터를 뒤집어 "보드 전용 호스트 안의 커밋만
  // 제외(exclude-the-board)"하고 나머지 모든 root를 관찰한다. 이러려면 보드 호스트를
  // 관찰 시작 전에 먼저 만들어 참조를 확보해야 한다.
  const overlayHost = document.createElement('div');
  overlayHost.id = 'rrb-overlay-root';

  instrument({
    name: 'react-render-board',
    onCommitFiberRoot(_rendererID: number, root: FiberRoot) {
      const containerInfo = (root as { containerInfo?: Node } | null)?.containerInfo;
      // 보드 자신의 root는 무시. containerInfo는 bippy 타입상 any지만 React 내부 구조상
      // FiberRoot에 항상 존재한다(fiberInspector.ts와 동일한 전제).
      if (containerInfo && overlayHost.contains(containerInfo)) return;
      try {
        store.handleCommit(root.current);
      } catch (err) {
        console.error('[rrb] 커밋 처리 중 에러', err);
      }
    },
  });

  // 조기 훅이 버퍼링해 둔 초기 커밋을 재생한다(Next 등 런타임이 앱보다 늦게 뜨는 경우).
  // Vite처럼 런타임이 앱보다 먼저 실행되면 버퍼가 없고 instrument가 처음부터 다 잡는다.
  const drainBufferedRoots = () => {
    const buffered = window.__RRB_ROOTS__;
    if (!buffered || typeof buffered.forEach !== 'function') return;
    buffered.forEach((root) => {
      try {
        const containerInfo = (root as { containerInfo?: Node } | null)?.containerInfo;
        if (containerInfo && overlayHost.contains(containerInfo)) return;
        store.handleCommit(root.current as never);
      } catch (err) {
        console.error('[rrb] 버퍼된 초기 커밋 재생 중 에러', err);
      }
    });
  };

  const mount = () => {
    document.body.appendChild(overlayHost);
    // 조기 스크립트가 띄운 폴백 버튼(#rrb-floating-button)은 이제 실제 BoardOverlay 토글이
    // 대신하므로 제거한다.
    document.getElementById('rrb-floating-button')?.remove();
    drainBufferedRoots();
    // 역방향 인터랙션(Alt+클릭/픽 모드 → 보드 이동). 대상 앱 컨테이너를 모르므로 body 전체를
    // 브리지 대상으로 둔다 — 평소 클릭엔 관여하지 않고(domInteraction.ts), 매치되는 subject
    // fiber가 없는 요소(보드 자신 등)는 조용히 무시된다.
    startDomClickBridge(document.body, interactionStore);
    createRoot(overlayHost).render(
      <StrictMode>
        <BoardOverlay store={store} interactionStore={interactionStore} />
      </StrictMode>,
    );
    console.log('[rrb] render-board injected (dev-only)');
  };

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}

// 부수효과 진입점: 주입된 <script>가 이 모듈을 import 하는 즉시 부팅한다.
bootRenderBoard();
