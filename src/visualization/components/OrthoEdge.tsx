import { useContext, useMemo } from 'react';
import { BaseEdge, type EdgeProps } from '@xyflow/react';
import { routeOrthogonal, pointsToPath, laneOffsetForKey } from '../lib/edgeRouting';
import { paletteHex, type ColorMode } from '../lib/groupColor';
import { EdgeObstaclesContext, EdgeLanesContext, EdgeBusPathsContext } from './edgeObstaclesContext';

interface CrossEdgeData {
  sourceColorIndex?: number;
  targetColorIndex?: number;
  colorMode?: ColorMode;
}

// SVG gradient id로 안전한 문자열(간선 id에 `->`·`:` 등이 섞여 url(#id)를 깨므로 영숫자만 남긴다).
function gradientId(edgeId: string): string {
  return `rrb-eg-${edgeId.replace(/[^a-zA-Z0-9]/g, '-')}`;
}

/**
 * 그룹 프레임을 피해 직교로 배선하는 커스텀 간선(ADR-0029 §5). 경로 자체는 Canvas의 중앙 배선
 * pass(routeCrossGroupBuses, ADR-0054 Phase 2)가 출발별 버스로 미리 계산해 context 맵으로 내려준다
 * — 이 간선은 자기 id로 점열을 읽기만 한다(간선별 A*를 중앙 pass로 대체). 좌표의 순수 함수라
 * 라이브 안정성이 레이아웃에서 상속된다.
 *
 * 색: 출발→타깃 **도메인 색 그라데이션**(ADR-0057). 허브(한 도메인이 여럿을 렌더)에서 출발색이
 * 전부 같아 선을 구별 못 하던 문제를, 도착부를 타깃 도메인 색으로 물들여 "어디로 가는지"를 색으로
 * 보인다. 인라인 stroke=url(#gradient)이 base 팔레트 CSS(no !important)를 이기고, hover 혈통/추적
 * (!important)일 때만 solid 강조색으로 복귀한다(focus 모드엔 적절). dash·opacity·width는 그대로.
 */
export function OrthoEdge({ id, source, sourceX, sourceY, targetX, targetY, markerEnd, style, data }: EdgeProps) {
  const obstacles = useContext(EdgeObstaclesContext);
  const lanes = useContext(EdgeLanesContext);
  const busPaths = useContext(EdgeBusPathsContext);
  // 레인 오프셋: 중앙 테이블(ADR-0054 Phase 1) 우선, 없으면 출발 id 해시 폴백. 중앙 맵에 이 간선이
  // 없을 때(이론상 없음)의 자체 배선에만 쓰인다.
  const laneOffset = lanes.get(source) ?? laneOffsetForKey(source);
  const path = useMemo(() => {
    // 중앙 pass가 낸 점열(버스 병합 또는 개별 폴백)을 우선 쓴다. 맵에 없으면 자기 좌표로 폴백 배선.
    const points =
      busPaths.get(id) ??
      routeOrthogonal({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, obstacles, { laneOffset });
    return pointsToPath(points, 8);
  }, [id, busPaths, sourceX, sourceY, targetX, targetY, obstacles, laneOffset]);

  // 그라데이션: 출발·타깃 도메인 색이 둘 다 있을 때만. 하나라도 pending이면 CSS 상시 색(단색) 유지.
  const d = (data ?? {}) as CrossEdgeData;
  const mode: ColorMode = d.colorMode === 'dark' ? 'dark' : 'light';
  const grad =
    d.sourceColorIndex !== undefined && d.targetColorIndex !== undefined
      ? { id: gradientId(id), from: paletteHex(d.sourceColorIndex, mode), to: paletteHex(d.targetColorIndex, mode) }
      : null;
  const edgeStyle = grad ? { ...style, stroke: `url(#${grad.id})` } : style;

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={edgeStyle} />
      {grad && (
        // userSpaceOnUse라 좌표가 path와 같은 flow 공간(뷰포트 transform 공유)이라 정렬된다.
        <linearGradient id={grad.id} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
          <stop offset="0%" stopColor={grad.from} />
          <stop offset="100%" stopColor={grad.to} />
        </linearGradient>
      )}
    </>
  );
}
