import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { RenderStore } from '../data/store';
import { Canvas } from './Canvas';
import { DomHighlightOverlay } from './components/DomHighlightOverlay';
import { createInteractionStore, type InteractionStore } from './lib/interactionStore';

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

  // 패널이 도킹된 화면 하단을 차지하는 동안 그 아래 깔린 실제 앱 콘텐츠가 영영 가려지지
  // 않도록, body에 클래스를 달아 소비자 쪽 페이지가 마지막 콘텐츠를 스크롤로 패널 위까지
  // 끌어올릴 수 있게 한다(예: src/index.css의 `.subject-root`). 픽 모드 중에는 커서를
  // crosshair로 바꿔 "지금 요소를 선택할 수 있다"는 걸 알려준다(domInteraction.ts 참고).
  // BoardOverlay는 별도 root로 마운트되는 경우가 많아(src/main.tsx) document.body가 이
  // 상태를 공유할 수 있는 가장 안전한 공통 조상이다.
  useEffect(() => {
    document.body.classList.toggle('rrb-board-open', boardOpen);
    return () => {
      document.body.classList.remove('rrb-board-open');
    };
  }, [boardOpen]);

  useEffect(() => {
    document.body.classList.toggle('rrb-pick-mode', pickModeActive);
    return () => {
      document.body.classList.remove('rrb-pick-mode');
    };
  }, [pickModeActive]);

  return (
    <>
      <div className="board-toggle-group">
        <button
          type="button"
          className={`board-toggle board-toggle--pick${pickModeActive ? ' board-toggle--pick-active' : ''}`}
          onClick={() => resolvedInteractionStore.setPickMode(!pickModeActive)}
          title="Alt(⌥)+클릭으로도 요소를 선택할 수 있습니다"
        >
          {pickModeActive ? '요소 선택 중… (취소)' : '🎯 요소 선택'}
        </button>
        <button
          type="button"
          className="board-toggle"
          onClick={() => resolvedInteractionStore.setBoardOpen(!boardOpen)}
        >
          {boardOpen ? 'render-board 닫기' : 'render-board 열기'}
        </button>
      </div>
      {boardOpen && (
        <div className="board-panel">
          <Canvas store={store} interactionStore={resolvedInteractionStore} />
        </div>
      )}
      <DomHighlightOverlay interactionStore={resolvedInteractionStore} />
    </>
  );
}
