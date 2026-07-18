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

// 간선 단계형 LOD(ADR-0029 결정 #4, 연구문서 7절 b). 현행 이진(지도=전부 숨김 ↔ 상세=전부
// 표시)을 3단으로 나눈다: 상세 모드(노드가 보이는 구간) 안에서도, 아직 덜 줌인한 "중간 줌"
// 에선 구조 간선만 두고 깊은(detail) 간선을 숨겼다가, 이 값 이상으로 더 줌인하면 페이드인한다.
// "멀리선 고속도로만"이라는 지도 은유의 간선 확장. MAP_MODE_THRESHOLD보다 커야 의미가 있다
// (노드가 이미 보이는 구간을 세분하는 것이므로).
export const EDGE_DETAIL_THRESHOLD = 0.9;

export function SemanticZoomController({ targetRef }: { targetRef: React.RefObject<HTMLDivElement | null> }) {
  const zoom = useStore((s) => s.transform[2]);
  const isMapMode = zoom < MAP_MODE_THRESHOLD;
  // 상세 모드지만 아직 덜 줌인한 중간 구간 — 깊은 간선을 숨기는 LOD 대역.
  const isMidDetail = !isMapMode && zoom < EDGE_DETAIL_THRESHOLD;

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    el.classList.toggle('zoom-far', isMapMode);
    el.classList.toggle('zoom-near', !isMapMode);
    el.classList.toggle('zoom-mid', isMidDetail);
  }, [isMapMode, isMidDetail, targetRef]);

  return (
    <Panel position="top-right" className="zoom-badge">
      {isMapMode ? '지도 모드 (영역만)' : '상세 모드 (컴포넌트 표시)'} · {Math.round(zoom * 100)}%
    </Panel>
  );
}
