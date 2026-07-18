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
import { isDevEnvironment } from './hooking/devEnvironment';
import { BoardOverlay } from './visualization/BoardOverlay';
// CSS 자기주입(실사용 결함 수정, ADR-0069): 이 런타임은 JS만 로드되고 CSS(style.css)는 소비자
// 쪽 주입 경로가 각자 챙겨야 했는데, Vite 플러그인은 JS만 주입했고 webpack 헬퍼는 css-loader
// 유무를 알 수 없어 보드가 스타일 없이 깨져 보이는 결함이 실사용(coverLetter)에서 나왔다.
// dev 전용 도구이므로 CSS를 문자열로 번들해(?inline) 부팅 시 <style>로 직접 주입한다 —
// 번들러·로더 구성과 무관하게 항상 스타일이 함께 온다. 소비자가 style.css를 별도로 로드해도
// 같은 규칙의 중복이라 무해하다(멱등 가드 포함).
import xyflowCss from '@xyflow/react/dist/style.css?inline';
import flowCss from './visualization/flow.css?inline';

declare global {
  interface Window {
    __RRB_BOOTED__?: boolean;
    // 번들러 플러그인이 대상 앱 root보다 먼저 심는 조기 훅이, 주입 런타임이 부팅되기 전에
    // 일어난 커밋(예: Next에서 클라이언트 하이드레이션까지의 초기 마운트)을 버퍼링해 둔다.
    // FiberRoot 자체(또는 하위호환으로 rendererID) → 최신 FiberRoot. 예전엔 rendererID 키라
    // 한 renderer의 여러 root(앱 + Next dev 오버레이) 중 마지막 것만 남아 앱 root가 유실될
    // 수 있었다(실사용 결함 — 아래 isToolOverlayRoot 주석 참고). Vite처럼 런타임이 앱보다
    // 먼저 뜨는 경우엔 없어도 된다.
    __RRB_ROOTS__?: Map<unknown, { current: unknown; containerInfo?: Node }>;
  }
}

// Next 16의 dev 오버레이(FPS 인디케이터·에러 오버레이)나 react-scan 툴바처럼 **개발 도구가
// 자기 UI를 별도 React root로** 띄우는 경우가 있다. store는 latest-root-wins(커밋된 root의
// 트리로 스냅샷 통째 교체)라, 이런 도구 root가 계속 커밋하면(FPS 애니메이션 등) 보드가 대상
// 앱 대신 도구 내부 트리를 그린다 — 실사용(greedy, Next 16+Turbopack)에서 "c8"/"eS" 같은
// 미니파이 이름만 보이고 역방향 이동이 죽었던 근본 원인(스파이크 재현으로 확정: 그 이름들은
// Next devtools UI 컴포넌트였고, 두 앱에서 글자까지 동일했다).
//
// 판별은 Next 소스 실측에 근거한다(next/dist/compiled/next-devtools/index.js —
// `createRoot(document.createElement("nextjs-portal"))` 후 같은 엘리먼트에 attachShadow):
// 도구 오버레이 컨테이너의 실측 패턴은 (a) 커스텀 엘리먼트(태그에 '-', NEXTJS-PORTAL 등),
// (b) 컨테이너 자신이 shadow host, (c) ShadowRoot 내부, (d) Next 오버레이 래퍼
// [data-nextjs-dev-overlay] 아래. 이 중 하나면 관찰에서 제외한다. 커스텀 엘리먼트 안에
// "대상 앱"을 마운트하는 케이스(웹컴포넌트 임베드)는 지원 밖 — 필요 증거가 나오면 옵션으로 연다.
function isToolOverlayRoot(containerInfo: Node | undefined): boolean {
  if (!containerInfo) return false;
  if (typeof containerInfo.getRootNode === 'function' && typeof ShadowRoot !== 'undefined'
    && containerInfo.getRootNode() instanceof ShadowRoot) return true;
  if (containerInfo instanceof Element) {
    if (containerInfo.tagName.includes('-')) return true;
    if (containerInfo.shadowRoot) return true;
    if (typeof containerInfo.closest === 'function' && containerInfo.closest('[data-nextjs-dev-overlay]')) return true;
  }
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
  // 진단 핸들(dev 전용 — 이 함수 전체가 dev 가드 뒤): 실사용 프로젝트에서 인터랙션이 죽었을 때
  // 콘솔에서 store.getFiber(id) 등을 직접 찔러볼 수 있게 노출한다(ADR-0065~0067 실사용 디버깅의
  // 교훈 — 배포된 번들 안에서는 모듈 내부에 접근할 방법이 전혀 없어 원인 격리가 어려웠다).
  (window as unknown as { __RRB_DEBUG__?: unknown }).__RRB_DEBUG__ = { store, interactionStore };

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
      // 보드 자신의 root와 도구 오버레이 root(Next devtools 등)는 무시. containerInfo는 bippy
      // 타입상 any지만 React 내부 구조상 FiberRoot에 항상 존재한다(fiberInspector.ts와 동일한 전제).
      if (containerInfo && overlayHost.contains(containerInfo)) return;
      if (isToolOverlayRoot(containerInfo)) return;
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
        if (isToolOverlayRoot(containerInfo)) return;
        store.handleCommit(root.current as never);
      } catch (err) {
        console.error('[rrb] 버퍼된 초기 커밋 재생 중 에러', err);
      }
    });
  };

  const mount = () => {
    // CSS 자기주입(상단 import 주석 참고). 중복 주입 가드 — HMR/다중 진입점에서도 1회만.
    if (!document.getElementById('rrb-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'rrb-styles';
      styleEl.textContent = `${xyflowCss}\n${flowCss}`;
      document.head.appendChild(styleEl);
    }
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
