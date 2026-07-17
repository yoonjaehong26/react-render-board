import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { InteractionStore } from '../lib/interactionStore';

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// 보드↔DOM 양방향 인터랙션(ADR-0024/0025)이 실제 페이지 위에 그리는 "React Scan 스타일"
// 가벼운 테두리. 그룹/도메인 경계는 절대 그리지 않는다(ADR-0024 결정 5) — 여기서 그리는 건
// interactionStore가 넘겨준 개별 DOM 요소뿐이다. document.body에 포탈로 그려 어느 pane
// 구조(BoardOverlay가 열려 있든 닫혀 있든) 위에서도 정확한 화면 좌표에 뜬다.
export function DomHighlightOverlay({ interactionStore }: { interactionStore: InteractionStore }) {
  const { highlightedElements } = useSyncExternalStore(interactionStore.subscribe, interactionStore.getSnapshot);
  const [rects, setRects] = useState<HighlightRect[]>([]);

  useEffect(() => {
    if (highlightedElements.length === 0) {
      setRects([]);
      return;
    }
    // 하이라이트 요청 시점에 1회만 측정한다 — interactionStore.HIGHLIGHT_DURATION_MS 동안
    // 스크롤이 일어나면 박스가 살짝 어긋날 수 있지만, 지속 시간이 짧아 실시간 추적(스크롤/리사이즈
    // 리스너)까지 두는 건 이번 스코프에서 과한 투자로 판단했다(알려진 한계, ADR-0025).
    setRects(
      highlightedElements.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left, width: r.width, height: r.height };
      }),
    );
  }, [highlightedElements]);

  if (rects.length === 0) return null;

  return createPortal(
    <div className="dom-highlight-overlay" aria-hidden="true">
      {rects.map((r, i) => (
        <div
          key={i}
          className="dom-highlight-overlay__box"
          style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
        />
      ))}
    </div>,
    document.body,
  );
}
