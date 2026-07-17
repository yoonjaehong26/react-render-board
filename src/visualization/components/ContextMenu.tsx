import { createPortal } from 'react-dom';

export interface ContextMenuAction {
  label: string;
  onSelect: () => void;
}

export interface ContextMenuState {
  /** 화면 좌표(clientX/clientY) — position: fixed로 그리므로 캔버스 팬/줌과 무관하다. */
  x: number;
  y: number;
  actions: ContextMenuAction[];
}

// 우클릭 컨텍스트 메뉴(ADR-0029) — 그룹 프레임/컴포넌트 노드 각각에 맞는 빠른 액션을 제공한다.
// DomHighlightOverlay.tsx와 같은 이유로 document.body에 포탈로 그린다: React Flow pane의
// transform(팬/줌)이 걸린 조상 밑에 있으면 position:fixed가 뷰포트가 아니라 그 조상 기준으로
// 계산되는 CSS 함정이 있어서다.
export function ContextMenu({ state, onClose }: { state: ContextMenuState | null; onClose: () => void }) {
  if (!state) return null;

  return createPortal(
    <div className="context-menu" style={{ left: state.x, top: state.y }} role="menu">
      {state.actions.map((action) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          className="context-menu__item"
          onClick={() => {
            action.onSelect();
            onClose();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
