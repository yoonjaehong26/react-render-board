import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { RenderStore } from '../data/store';
import { Canvas } from './Canvas';
import { DomHighlightOverlay } from './components/DomHighlightOverlay';
import { TargetBillboard } from './components/TargetBillboard';
import { createInteractionStore, type InteractionStore } from './lib/interactionStore';
import { CHROME_CIRCLE, CHROME_BORDER, HIGHLIGHT_RING } from './lib/roughStyle';
import {
  clampFraction,
  getStoredPanelLayout,
  setStoredPanelLayout,
  type PanelMode,
  type PanelDock,
  type PanelLayout,
} from './lib/panelLayoutPreference';
import {
  getStoredFloatingButtonPosition,
  setStoredFloatingButtonPosition,
  type FloatingButtonPosition,
} from './lib/floatingButtonPreference';
import { leastObstructiveDock, shouldUseFocusRail } from './lib/panelPlacement';
import {
  getStoredBillboardPreference,
  setStoredBillboardPreference,
  type BillboardPreference,
} from './lib/billboardPreference';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

const FLOATING_BUTTON_MARGIN = 16;
const DRAG_START_DISTANCE_PX = 6;

interface FloatingButtonDrag {
  pointerId: number;
  startX: number;
  startY: number;
  startPosition: FloatingButtonPosition;
}

// 패널 도킹 방향 아이콘 — 사각 아웃라인 + 도킹된 변을 채운 막대.
function DockIcon({ side }: { side: PanelDock }) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <rect x="1.75" y="1.75" width="12.5" height="12.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      {side === 'top' && <rect x="1.75" y="1.75" width="12.5" height="4.75" rx="1.5" fill="currentColor" />}
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
  /**
   * reserve-space 모드에서만 줄일, 통합 측이 명시한 레이아웃 경계. 주입 모드는 임의의
   * 앱 레이아웃을 바꾸지 않으므로 이 값을 주지 않는다.
   */
  layoutTarget?: HTMLElement | null;
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
export function BoardOverlay({ store, interactionStore, layoutTarget = null }: BoardOverlayProps) {
  const interactionStoreRef = useRef<InteractionStore | null>(null);
  if (!interactionStoreRef.current) interactionStoreRef.current = interactionStore ?? createInteractionStore();
  const resolvedInteractionStore = interactionStoreRef.current;

  const { boardOpen, pickModeActive, hoverTarget, selectedTarget, highlightedElements, navigateRequestId, autoPlacementRequestId } = useSyncExternalStore(
    resolvedInteractionStore.subscribe,
    resolvedInteractionStore.getSnapshot,
  );
  // hover는 "클릭하면 이게 선택된다"는 일시 프리뷰로 pinned 선택보다 우선한다. Alt를 놓거나
  // 픽 모드를 끄면 hoverTarget이 비워져 마지막 고정 선택 카드가 다시 드러난다.
  const billboardTarget = hoverTarget ?? selectedTarget;
  const billboardPreview = hoverTarget !== null;
  const [billboardPreference, setBillboardPreference] = useState(getStoredBillboardPreference);
  const billboardPreferenceRef = useRef(billboardPreference);
  billboardPreferenceRef.current = billboardPreference;

  const commitBillboardPreference = useCallback((next: BillboardPreference) => {
    setBillboardPreference(next);
    setStoredBillboardPreference(next);
  }, []);

  // 패널 도킹 위치(하단/좌/우) + 크기(화면 비율). localStorage로 새로고침 후에도 유지(ADR-0040).
  const [layout, setLayout] = useState(getStoredPanelLayout);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [railCollapsed, setRailCollapsed] = useState(false);

  // Document PiP는 창 하나만 유지한다. 지원하지 않는 브라우저는 null이라 현재 인페이지
  // 패널을 그대로 쓴다. 타입은 아직 표준 lib.dom에 없으므로 아래 request 함수에서 좁힌다.
  const [pipWindow, setPipWindow] = useState<Window | null>(null);

  // 플로팅 버튼은 어떤 호스트 앱 위에도 떠 있으므로, 사용자마다 가리지 말아야 할 앱 UI가
  // 다르다. 위치는 화면에서 버튼 묶음이 이동할 수 있는 범위의 비율로 영속화한다(ADR-0078).
  const [floatingButtonPosition, setFloatingButtonPosition] = useState(getStoredFloatingButtonPosition);
  const [floatingButtonSize, setFloatingButtonSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const floatingButtonRef = useRef<HTMLDivElement>(null);
  const floatingButtonDragRef = useRef<FloatingButtonDrag | null>(null);
  const floatingButtonDidDragRef = useRef(false);
  const [draggingFloatingButton, setDraggingFloatingButton] = useState(false);
  const [floatingToolsOpen, setFloatingToolsOpen] = useState(false);

  useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    const element = floatingButtonRef.current;
    if (!element) return;
    const updateSize = () => setFloatingButtonSize({ width: element.offsetWidth, height: element.offsetHeight });
    updateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const floatingButtonBounds = {
    x: Math.max(FLOATING_BUTTON_MARGIN, viewport.width - floatingButtonSize.width - FLOATING_BUTTON_MARGIN),
    y: Math.max(FLOATING_BUTTON_MARGIN, viewport.height - floatingButtonSize.height - FLOATING_BUTTON_MARGIN),
  };
  const floatingButtonStyle =
    floatingButtonSize.width === 0
      ? undefined
      : {
          left: FLOATING_BUTTON_MARGIN + (floatingButtonBounds.x - FLOATING_BUTTON_MARGIN) * floatingButtonPosition.x,
          top: FLOATING_BUTTON_MARGIN + (floatingButtonBounds.y - FLOATING_BUTTON_MARGIN) * floatingButtonPosition.y,
          right: 'auto',
          bottom: 'auto',
        };

  const onFloatingButtonPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    floatingButtonDidDragRef.current = false;
    floatingButtonDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: floatingButtonPosition,
    };
  }, [floatingButtonPosition]);

  const onFloatingButtonPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = floatingButtonDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!floatingButtonDidDragRef.current && Math.hypot(dx, dy) < DRAG_START_DISTANCE_PX) return;
    // pointerdown에서 곧바로 capture하면 pointerup 뒤의 click target이 부모 div로 바뀌어
    // 내부 FAB 버튼의 onClick이 사라진다. 실제 드래그 임계값을 넘긴 뒤에만 capture한다.
    if (!floatingButtonDidDragRef.current) event.currentTarget.setPointerCapture(event.pointerId);
    floatingButtonDidDragRef.current = true;
    setDraggingFloatingButton(true);
    event.preventDefault();
    const horizontalRange = Math.max(0, floatingButtonBounds.x - FLOATING_BUTTON_MARGIN);
    const verticalRange = Math.max(0, floatingButtonBounds.y - FLOATING_BUTTON_MARGIN);
    setFloatingButtonPosition({
      x: horizontalRange === 0 ? 0 : Math.min(1, Math.max(0, drag.startPosition.x + dx / horizontalRange)),
      y: verticalRange === 0 ? 0 : Math.min(1, Math.max(0, drag.startPosition.y + dy / verticalRange)),
    });
  }, [floatingButtonBounds.x, floatingButtonBounds.y]);

  const finishFloatingButtonDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = floatingButtonDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    floatingButtonDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!floatingButtonDidDragRef.current) return;
    setDraggingFloatingButton(false);
    setFloatingButtonPosition((current) => {
      setStoredFloatingButtonPosition(current);
      return current;
    });
    // pointerup 직후 발생하는 click만 막고, 다음 정상 클릭에는 영향이 없게 한다.
    window.setTimeout(() => {
      floatingButtonDidDragRef.current = false;
    }, 0);
  }, []);

  const ignoreClickAfterFloatingButtonDrag = useCallback((event: React.MouseEvent) => {
    if (!floatingButtonDidDragRef.current) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }, []);

  const commitLayout = useCallback((next: PanelLayout) => {
    setLayout(next);
    setStoredPanelLayout(next);
  }, []);

  const setDock = useCallback(
    (dock: PanelDock) => commitLayout({ ...layoutRef.current, dock }),
    [commitLayout],
  );

  const setMode = useCallback(
    (mode: PanelMode) => {
      // 선언적 경계 없는 주입 모드에서 reserve-space를 허용하면 임의 페이지를 밀게 된다.
      if (mode === 'reserve-space' && !layoutTarget) return;
      commitLayout({ ...layoutRef.current, mode });
    },
    [commitLayout, layoutTarget],
  );

  // 리사이즈 핸들 드래그: 안쪽으로 끌면 커진다(하단=위로/좌=오른쪽/우=왼쪽). 드래그 중에는
  // 상태만 갱신하고, 놓을 때(pointerup) 한 번 localStorage에 영속화한다. 크기는 창 치수 대비
  // 비율로 잡아 창이 리사이즈돼도 유지된다.
  const onResizePointerDown = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    const { dock, sizeFraction } = layoutRef.current;
    const vertical = dock === 'bottom' || dock === 'top';
    const startPos = vertical ? e.clientY : e.clientX;
    const dim = vertical ? window.innerHeight : window.innerWidth;

    function onMove(ev: PointerEvent) {
      const cur = vertical ? ev.clientY : ev.clientX;
      const growsTowardPointer = dock === 'left' || dock === 'top';
      const deltaPx = growsTowardPointer ? cur - startPos : startPos - cur;
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

  // 기본 overlay는 대상 앱을 절대 건드리지 않는다. 단 통합 측이 layoutTarget을 준 reserve-space
  // 모드만 그 경계의 가용 폭/높이를 줄인다. 모든 인라인 값을 정확히 복원해 앱과 보드의 수명이
  // 달라도 흔적을 남기지 않는다.
  useEffect(() => {
    document.body.classList.toggle('rrb-board-open', boardOpen);
    return () => {
      document.body.classList.remove('rrb-board-open');
    };
  }, [boardOpen]);

  useEffect(() => {
    if (!layoutTarget || !boardOpen || layout.mode !== 'reserve-space' || pipWindow) return;
    const { style } = layoutTarget;
    const previous = {
      marginLeft: style.marginLeft,
      marginRight: style.marginRight,
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
    };
    const size = `${(layout.sizeFraction * 100).toFixed(3)}${layout.dock === 'left' || layout.dock === 'right' ? 'vw' : 'vh'}`;
    if (layout.dock === 'left') style.marginLeft = size;
    if (layout.dock === 'right') style.marginRight = size;
    // 상·하단은 폭을 억지로 줄이지 않고, 대상의 정상 스크롤 영역 끝에 여백을 둔다.
    if (layout.dock === 'top') style.paddingTop = size;
    if (layout.dock === 'bottom') style.paddingBottom = size;
    return () => {
      style.marginLeft = previous.marginLeft;
      style.marginRight = previous.marginRight;
      style.paddingTop = previous.paddingTop;
      style.paddingBottom = previous.paddingBottom;
    };
  }, [boardOpen, layout.dock, layout.mode, layout.sizeFraction, layoutTarget, pipWindow]);

  // requestNavigate()와 highlight()는 별도 store update다. interactionStore가 닫힌 보드를
  // 열었던 request id만 별도로 남겨, 두 번째 update에서 실제 요소 사각형을 읽는다.
  useEffect(() => {
    if (!boardOpen) setRailCollapsed(false);
  }, [boardOpen]);
  const lastSmartNavigateRef = useRef(0);
  useEffect(() => {
    if (!boardOpen || autoPlacementRequestId !== navigateRequestId || navigateRequestId === 0 || navigateRequestId === lastSmartNavigateRef.current) return;
    const target = highlightedElements[0];
    if (!target) return; // requestNavigate와 highlight는 별도 store update라 다음 렌더에서 재시도한다.
    lastSmartNavigateRef.current = navigateRequestId;
    if (layout.mode === 'reserve-space' || pipWindow) return;
    const rect = target.getBoundingClientRect();
    const placement = leastObstructiveDock(
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      layoutRef.current.dock,
      layoutRef.current.sizeFraction,
      { width: window.innerWidth, height: window.innerHeight },
    );
    if (placement.dock !== layoutRef.current.dock) setDock(placement.dock);
    setRailCollapsed(
      shouldUseFocusRail(
        { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        placement.overlapRatio,
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [autoPlacementRequestId, boardOpen, highlightedElements, layout.mode, navigateRequestId, pipWindow, setDock]);

  // 크기는 화면 비율로 저장하고(방향 전환·창 리사이즈에도 유지), 도킹 방향에 따라 하단=높이(vh)
  // /좌·우=너비(vw)로 해석한다.
  const panelSizeCss = `${(layout.sizeFraction * 100).toFixed(3)}${layout.dock === 'bottom' || layout.dock === 'top' ? 'vh' : 'vw'}`;

  const openPictureInPicture = useCallback(async () => {
    const documentPiP = (window as Window & { documentPictureInPicture?: { requestWindow(options?: { width?: number; height?: number }): Promise<Window> } }).documentPictureInPicture;
    if (!documentPiP || pipWindow) return;
    try {
      const next = await documentPiP.requestWindow({ width: Math.round(window.innerWidth * 0.48), height: Math.round(window.innerHeight * 0.7) });
      // Vite/injected CSS 모두 style/link 태그로 복제한다. PiP는 별도 document라 원 문서의
      // 스타일 상속이 없으며, 보드만 옮겨 대상 앱은 원래 문서에 남는다.
      for (const node of Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))) {
        next.document.head.appendChild(node.cloneNode(true));
      }
      next.document.body.className = document.body.className;
      next.addEventListener('pagehide', () => setPipWindow(null), { once: true });
      setRailCollapsed(false);
      setPipWindow(next);
    } catch {
      // 사용자 제스처/브라우저 정책으로 막히면 현재 도킹 패널이 그대로 폴백이다.
    }
  }, [pipWindow]);

  const closePictureInPicture = useCallback(() => {
    pipWindow?.close();
    setPipWindow(null);
  }, [pipWindow]);

  useEffect(() => {
    document.body.classList.toggle('rrb-pick-mode', pickModeActive);
    return () => {
      document.body.classList.remove('rrb-pick-mode');
    };
  }, [pickModeActive]);

  const panel = boardOpen ? (
    <div
      className={`board-panel board-panel--${pipWindow ? 'detached' : layout.dock}${railCollapsed && !pipWindow ? ' board-panel--rail' : ''}`}
      style={{ ...boardPanelVars, '--rrb-panel-size': panelSizeCss } as CSSProperties}
    >
      {railCollapsed && !pipWindow ? (
        <button type="button" className="board-panel__rail-button" onClick={() => setRailCollapsed(false)} aria-label="render-board 펼치기" title="선택한 화면 요소를 가리지 않도록 축소됨 — 보드 펼치기">
          ⟷
        </button>
      ) : (
        <>
          <div className="board-panel__resize" onPointerDown={onResizePointerDown} role="separator" aria-orientation={layout.dock === 'bottom' || layout.dock === 'top' ? 'horizontal' : 'vertical'} aria-label="패널 크기 조절 (드래그)" />
          <div className="board-panel__chrome">
            <div className="board-panel__dock" role="group" aria-label="패널 위치">
              {(['left', 'top', 'bottom', 'right'] as const).map((d) => {
                const label = d === 'bottom' ? '하단 도킹' : d === 'top' ? '상단 도킹' : d === 'left' ? '왼쪽 사이드바' : '오른쪽 사이드바';
                return <button key={d} type="button" className={`board-panel__dock-btn${layout.dock === d ? ' board-panel__dock-btn--active' : ''}`} aria-pressed={layout.dock === d} aria-label={label} title={label} onClick={() => setDock(d)}><DockIcon side={d} /></button>;
              })}
              {layoutTarget && <button type="button" className={`board-panel__dock-btn${layout.mode === 'reserve-space' ? ' board-panel__dock-btn--active' : ''}`} aria-pressed={layout.mode === 'reserve-space'} aria-label="대상 앱 공간 확보" title="대상 앱 공간 확보" onClick={() => setMode(layout.mode === 'reserve-space' ? 'overlay' : 'reserve-space')}>↔</button>}
              {!pipWindow && 'documentPictureInPicture' in window && <button type="button" className="board-panel__dock-btn" aria-label="별도 항상 위 창으로 분리" title="별도 항상 위 창으로 분리" onClick={openPictureInPicture}>↗</button>}
              {pipWindow && <button type="button" className="board-panel__dock-btn" aria-label="도킹 패널로 돌아가기" title="도킹 패널로 돌아가기" onClick={closePictureInPicture}>↙</button>}
            </div>
          </div>
          <Canvas store={store} interactionStore={resolvedInteractionStore} />
        </>
      )}
    </div>
  ) : null;

  return (
    <>
      {/* 원형 플로팅 버튼(ADR-0037, TanStack Query Devtools 패턴): 큰 메인 FAB = 보드 열고 닫기,
          보조 기능은 작은 도구 메뉴에 접는다. 호스트 앱 위 크롬(O(1) 레이어, ADR-0030
          성능 분석)이라 볼펜 세기 rough 원 테두리(CHROME_CIRCLE)를 입히고, 보드 내부 다크모드와
          무관한 호스트-앱 크롬이므로 항상 라이트 변형을 쓴다. 메인 FAB의 "rb"는 render-board
          워드마크를 원형에 맞춘 모노그램이라 손글씨체로 액센트한다(ADR-0030).
          접근성 이름(aria-label)은 verify 스크립트(openBoard.mjs 등)가 버튼을 찾는 이름이라
          "render-board 열기/닫기"를 그대로 유지한다 — 모노그램으로 바뀌어도 이름은 안 바뀐다. */}
      <div
        ref={floatingButtonRef}
        className={`board-toggle-group${draggingFloatingButton ? ' board-toggle-group--dragging' : ''}`}
        style={floatingButtonStyle}
        onPointerDown={onFloatingButtonPointerDown}
        onPointerMove={onFloatingButtonPointerMove}
        onPointerUp={finishFloatingButtonDrag}
        onPointerCancel={finishFloatingButtonDrag}
      >
        <div className="board-fab__tools">
          <button
            type="button"
            className="board-fab board-fab--tools rrb-rough-chrome"
            style={{ backgroundImage: CHROME_CIRCLE.light }}
            onClick={(event) => {
              if (ignoreClickAfterFloatingButtonDrag(event)) return;
              setFloatingToolsOpen((open) => !open);
            }}
            aria-expanded={floatingToolsOpen}
            aria-label="render-board 도구"
            title="render-board 도구"
          >
            •••
          </button>
          {floatingToolsOpen && (
            <div className="board-fab__tools-menu" role="menu" aria-label="render-board 도구">
              <button
                type="button"
                className={`board-fab board-fab--pick rrb-rough-chrome${pickModeActive ? ' board-fab--pick-active' : ''}`}
                style={{ backgroundImage: CHROME_CIRCLE.light }}
                onClick={(event) => {
                  if (ignoreClickAfterFloatingButtonDrag(event)) return;
                  resolvedInteractionStore.setPickMode(!pickModeActive);
                  setFloatingToolsOpen(false);
                }}
                aria-pressed={pickModeActive}
                aria-label={pickModeActive ? '요소 선택 중 (취소)' : '요소 선택'}
                title="요소 선택 — Alt(⌥)+클릭으로도 됩니다"
              >
                <svg className="board-fab__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 3l6 15 2.2-5.6L19 10 5 3z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className={`board-fab board-fab--billboard rrb-rough-chrome${billboardPreference.visible ? ' board-fab--pick-active' : ''}`}
                style={{ backgroundImage: CHROME_CIRCLE.light }}
                onClick={(event) => {
                  if (ignoreClickAfterFloatingButtonDrag(event)) return;
                  commitBillboardPreference({ ...billboardPreferenceRef.current, visible: !billboardPreferenceRef.current.visible });
                  setFloatingToolsOpen(false);
                }}
                aria-pressed={billboardPreference.visible}
                aria-label={billboardPreference.visible ? '전광판 끄기' : '전광판 켜기'}
                title={billboardPreference.visible ? '전광판 끄기' : '전광판 켜기'}
              >
                <svg className="board-fab__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3.5" y="5" width="17" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M8 20h8M12 17v3M7 9h10M7 13h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className={`board-fab board-fab--main rrb-rough-chrome${boardOpen ? ' board-fab--open' : ''}`}
          style={
            { '--fab-circle': CHROME_CIRCLE.light, '--fab-pill': CHROME_BORDER.light } as CSSProperties
          }
          onClick={(event) => {
            if (ignoreClickAfterFloatingButtonDrag(event)) return;
            resolvedInteractionStore.setBoardOpen(!boardOpen);
          }}
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
      {billboardPreference.visible && billboardTarget && (
        <TargetBillboard
          target={billboardTarget}
          preview={billboardPreview}
          onClear={billboardPreview ? undefined : () => resolvedInteractionStore.clearSelectedTarget()}
          position={billboardPreference.position}
          onPositionChange={(position) => setBillboardPreference((current) => ({ ...current, position }))}
          onPositionCommit={() => setStoredBillboardPreference(billboardPreferenceRef.current)}
        />
      )}
      {pipWindow ? createPortal(panel, pipWindow.document.body) : panel}
      <DomHighlightOverlay interactionStore={resolvedInteractionStore} />
    </>
  );
}
