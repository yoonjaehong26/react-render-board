import { useContext, useMemo } from 'react';
import { BaseEdge, type EdgeProps } from '@xyflow/react';
import { routeOrthogonal, pointsToPath, laneOffsetForKey } from '../lib/edgeRouting';
import { EdgeObstaclesContext } from './edgeObstaclesContext';

/**
 * 그룹 프레임을 피해 직교로 배선하는 커스텀 간선(Hanan-그리드 A*, ADR-0029 §5). 좌표의 순수
 * 함수라 라이브 안정성이 레이아웃에서 상속된다(새 상태·매 커밋 전역 재배선 없음). className/style은
 * React Flow가 래퍼에 그대로 실어줘 색·점선·감쇠 CSS는 smoothstep 때와 동일하게 적용된다.
 */
export function OrthoEdge({ source, sourceX, sourceY, targetX, targetY, markerEnd, style }: EdgeProps) {
  const obstacles = useContext(EdgeObstaclesContext);
  // 소스(부모) 노드 id로 레인을 정해, 부모가 다른 경로를 다른 트랙으로 분리한다(피드백 2 — 겹침
  // 방지). 같은 부모의 여러 간선은 같은 레인이라 여전히 공유(버스).
  const laneOffset = laneOffsetForKey(source);
  // A*는 간선당 O(격자²)라 매 렌더가 아니라 끝점 좌표·장애물·레인이 바뀔 때만 재계산한다(obstacles는
  // Canvas에서 memoize된 안정 참조라, 레이아웃이 안 바뀌면 커밋마다 재배선하지 않는다).
  const path = useMemo(() => {
    const points = routeOrthogonal({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, obstacles, { laneOffset });
    return pointsToPath(points, 8);
  }, [sourceX, sourceY, targetX, targetY, obstacles, laneOffset]);
  return <BaseEdge path={path} markerEnd={markerEnd} style={style} />;
}
