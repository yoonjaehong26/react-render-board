import { Panel, useStore } from '@xyflow/react';
import { useEffect } from 'react';

// ui-philosophy.md: "줌 아웃 → 큰 영역만 보임 / 줌 인 → 실제 컴포넌트 노드가 드러남"
// zoom 값 하나만 useStore로 구독해 이 컴포넌트만 리렌더되게 하고(수백 개 노드 트리는 안 건드림),
// 실제 표시 전환은 CSS 클래스 토글로 처리한다(targetRef에 zoom-far/zoom-near 클래스를 부여).
const MAP_MODE_THRESHOLD = 0.55;

export function SemanticZoomController({ targetRef }: { targetRef: React.RefObject<HTMLDivElement | null> }) {
  const zoom = useStore((s) => s.transform[2]);
  const isMapMode = zoom < MAP_MODE_THRESHOLD;

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    el.classList.toggle('zoom-far', isMapMode);
    el.classList.toggle('zoom-near', !isMapMode);
  }, [isMapMode, targetRef]);

  return (
    <Panel position="top-right" className="zoom-badge">
      {isMapMode ? '지도 모드 (영역만)' : '상세 모드 (컴포넌트 표시)'} · {Math.round(zoom * 100)}%
    </Panel>
  );
}
