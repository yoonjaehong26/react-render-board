import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { RenderStore } from '../data/store';
import { Canvas } from './Canvas';
import { DomHighlightOverlay } from './components/DomHighlightOverlay';
import { createInteractionStore, type InteractionStore } from './lib/interactionStore';
import { CHROME_CIRCLE, CHROME_BORDER, HIGHLIGHT_RING } from './lib/roughStyle';
import {
  clampFraction,
  getStoredPanelLayout,
  setStoredPanelLayout,
  type PanelDock,
  type PanelLayout,
} from './lib/panelLayoutPreference';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

// 패널 도킹 방향 아이콘(ADR-0040) — 사각 아웃라인 + 도킹된 변을 채운 막대. 하단/좌/우.
function DockIcon({ side }: { side: PanelDock }) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <rect x="1.75" y="1.75" width="12.5" height="12.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      {side === 'bottom' && <rect x="1.75" y="9.5" width="12.5" height="4.75" rx="1.5" fill="currentColor" />}
      {side === 'left' && <rect x="1.75" y="1.75" width="4.75" height="12.5" rx="1.5" fill="currentColor" />}
      {side === 'right' && <rect x="9.5" y="1.75" width="4.75" height="12.5" rx="1.5" fill="currentColor" />}
    </svg>
  );
}

// 툴바 크롬(볼펜 rough)·강조 링(손그림) 이미지를 CSS 변수로 board-panel에 내려, flow.css의
// `.toolbar button`/`.component-node--highlighted::after`가 shared 파일(Canvas.tsx)을 건드리지
// 않고 참조하게 한다. 값은 roughStyle이 만든 정적 data URI라 노드 수와 무관(O(1)).
const boardPanelVars = {
  '--rrb-chrome-border-light': CHROME_BORDER.light,
  '--rrb-chrome-border-dark': CHROME_BORDER.dark,
  '--rrb-highlight-ring-light': HIGHLIGHT_RING.light,
  '--rrb-highlight-ring-dark': HIGHLIGHT_RING.dark,
} as CSSProperties;

export interface BoardOverlayProps {
  store: RenderStore;
  /** 생략하면 내부에서 하나 만든다 — Canvas의 같은 동작(§CanvasProps) 참고. */
  interactionStore?: InteractionStore;
}

// ADR-0020(배포/진입 UX) + ADR-0025(도킹 패널로 수정)가 정한 "같은 페이지 + 플로팅 버튼 +
// 하단 도킹 패널"을 정식 컴포넌트로 만든 것. experiments/real-app-validation/excalidraw/
// .../mount.tsx가 인라인 스타일 전체화면 오버레이로 처음 검증했던 플로팅 버튼 패턴을
// CSS 클래스 기반 도킹 패널로 재구현했다(이 프로젝트는 인라인 style을 동적 값에만 쓴다 —
// GroupNode의 counter-scale이 유일한 예외).
//
// 패널이 화면 하단만 차지하므로(전체화면 아님, ADR-0025) 계측 대상 앱은 패널이 열려 있는
// 동안에도 항상 보이고 조작 가능하다 — 정방향(Canvas의 onNodeClick)이 실제 DOM 요소를
// 하이라이트하는 것도, 역방향(domInteraction.ts의 DOM 클릭 브리지)이 패널을 여는 것도
// 전부 이 boardOpen 하나로 조정된다.
export function BoardOverlay({ store, interactionStore }: BoardOverlayProps) {
  const interactionStoreRef = useRef<InteractionStore | null>(null);
  if (!interactionStoreRef.current) interactionStoreRef.current = interactionStore ?? createInteractionStore();
  const resolvedInteractionStore = interactionStoreRef.current;

  const { boardOpen, pickModeActive } = useSyncExternalStore(
    resolvedInteractionStore.subscribe,
    resolvedInteractionStore.getSnapshot,
  );

  // 패널 도킹 위치(하단/좌/우) + 크기(화면 비율). localStorage로 새로고침 후에도 유지(ADR-0040).
  const [layout, setLayout] = useState(getStoredPanelLayout);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const commitLayout = useCallback((next: PanelLayout) => {
    setLayout(next);
    setStoredPanelLayout(next);
  }, []);

  const setDock = useCallback(
    (dock: PanelDock) => commitLayout({ ...layoutRef.current, dock }),
    [commitLayout],
  );

  // 리사이즈 핸들 드래그: 안쪽으로 끌면 커진다(하단=위로/좌=오른쪽/우=왼쪽). 드래그 중에는
  // 상태만 갱신하고, 놓을 때(pointerup) 한 번 localStorage에 영속화한다. 크기는 창 치수 대비
  // 비율로 잡아 창이 리사이즈돼도 유지된다.
  const onResizePointerDown = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    const { dock, sizeFraction } = layoutRef.current;
    const startPos = dock === 'bottom' ? e.clientY : e.clientX;
    const dim = dock === 'bottom' ? window.innerHeight : window.innerWidth;

    function onMove(ev: PointerEvent) {
      const cur = dock === 'bottom' ? ev.clientY : ev.clientX;
      const deltaPx = dock === 'left' ? cur - startPos : startPos - cur;
      setLayout((prev) => ({ ...prev, sizeFraction: clampFraction(sizeFraction + deltaPx / dim) }));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setStoredPanelLayout(layoutRef.current);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  // 오버레이 전용(ADR-0040): 패널은 위에 떠서 덮기만 하고 계측 대상 앱의 레이아웃/CSS는 절대
  // 건드리지 않는다 — 앱을 밀어내던 subject 패딩 주입은 "관찰 도구가 관찰 대상을 바꾼다"는
  // 문제(반응형 breakpoint 오작동 등)라 제거했다. 가려진 부분은 패널을 이동/크기조절/닫아서
  // 본다(react-scan/TanStack Query Devtools와 같은 모델). body에는 "보드 열림" 신호만 남기고,
  // 패널 크기는 패널 요소에 --rrb-panel-size로 직접 준다(아래 render).
  useEffect(() => {
    document.body.classList.toggle('rrb-board-open', boardOpen);
    return () => {
      document.body.classList.remove('rrb-board-open');
    };
  }, [boardOpen]);

  // 크기는 화면 비율로 저장하고(방향 전환·창 리사이즈에도 유지), 도킹 방향에 따라 하단=높이(vh)
  // /좌·우=너비(vw)로 해석한다.
  const panelSizeCss = `${(layout.sizeFraction * 100).toFixed(3)}${layout.dock === 'bottom' ? 'vh' : 'vw'}`;

  useEffect(() => {
    document.body.classList.toggle('rrb-pick-mode', pickModeActive);
    return () => {
      document.body.classList.remove('rrb-pick-mode');
    };
  }, [pickModeActive]);

  return (
    <>
      {/* 원형 플로팅 버튼(ADR-0037, TanStack Query Devtools 패턴): 큰 메인 FAB = 보드 열고 닫기,
          바로 옆 작은 위성 = 요소 선택(픽) 모드 토글. 호스트 앱 위 크롬(O(1) 레이어, ADR-0030
          성능 분석)이라 볼펜 세기 rough 원 테두리(CHROME_CIRCLE)를 입히고, 보드 내부 다크모드와
          무관한 호스트-앱 크롬이므로 항상 라이트 변형을 쓴다. 메인 FAB의 "rb"는 render-board
          워드마크를 원형에 맞춘 모노그램이라 손글씨체로 액센트한다(ADR-0030).
          접근성 이름(aria-label)은 verify 스크립트(openBoard.mjs 등)가 버튼을 찾는 이름이라
          "render-board 열기/닫기"를 그대로 유지한다 — 모노그램으로 바뀌어도 이름은 안 바뀐다. */}
      <div className="board-toggle-group">
        <button
          type="button"
          className={`board-fab board-fab--pick rrb-rough-chrome${pickModeActive ? ' board-fab--pick-active' : ''}`}
          style={{ backgroundImage: CHROME_CIRCLE.light }}
          onClick={() => resolvedInteractionStore.setPickMode(!pickModeActive)}
          aria-pressed={pickModeActive}
          aria-label={pickModeActive ? '요소 선택 중 (취소)' : '요소 선택'}
          title="요소 선택 — Alt(⌥)+클릭으로도 됩니다"
        >
          {/* 마우스 포인터 아이콘 — "이 상태에서 화면 요소를 골라잡는다"는 신호(ADR-0037) */}
          <svg className="board-fab__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M5 3l6 15 2.2-5.6L19 10 5 3z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className={`board-fab board-fab--main rrb-rough-chrome${boardOpen ? ' board-fab--open' : ''}`}
          style={
            { '--fab-circle': CHROME_CIRCLE.light, '--fab-pill': CHROME_BORDER.light } as CSSProperties
          }
          onClick={() => resolvedInteractionStore.setBoardOpen(!boardOpen)}
          aria-pressed={boardOpen}
          aria-label={boardOpen ? 'render-board 닫기' : 'render-board 열기'}
          title={boardOpen ? 'render-board 닫기' : 'render-board 열기'}
        >
          {/* 평소엔 렌더 트리 글리프의 원, hover/포커스 시 옆으로 "render-board" 워드마크가
              펼쳐진다(ADR-0037). 트리 아이콘은 이 도구가 보여주는 waterfall 렌더 트리의 축소형. */}
          <svg className="board-fab__tree" viewBox="0 0 24 24" aria-hidden="true">
            <line x1="12" y1="7.5" x2="6" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="12" y1="7.5" x2="18" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="12" cy="5" r="2.6" fill="currentColor" />
            <circle cx="6" cy="18.5" r="2.6" fill="currentColor" />
            <circle cx="18" cy="18.5" r="2.6" fill="currentColor" />
          </svg>
          <span className="rrb-wordmark board-fab__wordmark">render-board</span>
        </button>
      </div>
      {boardOpen && (
        <div
          className={`board-panel board-panel--${layout.dock}`}
          style={{ ...boardPanelVars, '--rrb-panel-size': panelSizeCss } as CSSProperties}
        >
          {/* 안쪽 가장자리 리사이즈 핸들(드래그로 크기 조절, ADR-0040) */}
          <div
            className="board-panel__resize"
            onPointerDown={onResizePointerDown}
            role="separator"
            aria-orientation={layout.dock === 'bottom' ? 'horizontal' : 'vertical'}
            aria-label="패널 크기 조절 (드래그)"
          />
          {/* 도킹 위치 전환(하단/좌/우) — 안쪽 가장자리 중앙에 얹은 작은 컨트롤 */}
          <div className="board-panel__dock" role="group" aria-label="패널 위치">
            {(['left', 'bottom', 'right'] as const).map((d) => {
              const label = d === 'bottom' ? '하단 도킹' : d === 'left' ? '왼쪽 사이드바' : '오른쪽 사이드바';
              return (
                <button
                  key={d}
                  type="button"
                  className={`board-panel__dock-btn${layout.dock === d ? ' board-panel__dock-btn--active' : ''}`}
                  aria-pressed={layout.dock === d}
                  aria-label={label}
                  title={label}
                  onClick={() => setDock(d)}
                >
                  <DockIcon side={d} />
                </button>
              );
            })}
          </div>
          <Canvas store={store} interactionStore={resolvedInteractionStore} />
        </div>
      )}
      <DomHighlightOverlay interactionStore={resolvedInteractionStore} />
    </>
  );
}
