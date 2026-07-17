import { Panel, useStore } from '@xyflow/react';
import { useEffect } from 'react';

// ui-philosophy.md: "줌 아웃 → 큰 영역만 보임 / 줌 인 → 실제 컴포넌트 노드가 드러남"
// zoom 값 하나만 useStore로 구독해 이 컴포넌트만 리렌더되게 하고(라이브 노드 트리 리렌더와 분리),
// 실제 표시 전환은 CSS 클래스 토글로 처리한다(targetRef에 zoom-far/zoom-near 클래스를 부여).
// exp2(ADR-0006)가 그대로 재사용 가능하도록 설계해 둔 컴포넌트라 변경 없이 가져온다.
// Canvas.tsx도 뷰포트 기반 부분 재계산(ADR-0016)에서 "지도 모드에서는 그룹 내부를 아예
// 펼치지 않는다"는 판단에 이 threshold를 그대로 재사용한다 — 두 곳에서 서로 다른 값을
// 쓰면 "지도 모드 배지"와 "실제로 접힌 그룹"이 어긋나 보이므로 반드시 하나로 공유한다.
export const MAP_MODE_THRESHOLD = 0.55;

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
