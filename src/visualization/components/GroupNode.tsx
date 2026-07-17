import { NodeToolbar, Position, useViewport, type NodeProps } from '@xyflow/react';
import type { GroupNodeData } from '../lib/toFlow';

// ui-philosophy.md의 "영역(region) 기반 그룹핑" — 뭉쳐서 숨기지 않고 회색 박스 경계만 그어준다.
// 실제 컴포넌트 노드는 이 프레임 "안에" 그대로 남아 있다(React Flow parentId/extent:'parent').

// 지도 모드 LOD (ADR-0016 ②): minZoom을 크게 낮춰(0.05 → 0.001) fitView가 대규모 콘텐츠를
// 바닥에 막히지 않고 실제로 전부 담게 했더니, 이번엔 CSS `.zoom-far` 폰트 크기 고정값(20px)이
// 캔버스 자체의 transform: scale(zoom)에 함께 눌려 1~5% 줌에서는 사실상 안 보이는 크기가
// 됐다(ADR-0014가 지적한 "라벨 텍스트가 읽을 수 없어짐"). 라벨에 캔버스 줌의 역수를 곱해
// 화면 기준 크기를 고정한다 — 그룹 프레임 자체는 월드 좌표대로 계속 줄어들어(그래야 지도가
// 성립한다) fitView 배치는 그대로 유지하면서, 텍스트만 항상 읽을 수 있는 크기를 유지한다.
export function GroupNode({ id, data }: NodeProps) {
  const { label, count, pending, collapsed, colorIndex, manuallyCollapsed, onToggleCollapse } =
    data as GroupNodeData;
  const { zoom } = useViewport();
  const classes = ['group-node'];
  if (pending) classes.push('group-node--pending');
  if (collapsed) classes.push('group-node--collapsed');
  if (colorIndex !== undefined) classes.push(`group-node--palette-${colorIndex}`);

  // zoom은 minZoom(0.001) 아래로 내려가지 않지만, 짧은 전환 애니메이션 도중 관측치가
  // 그보다 살짝 흔들릴 수 있어 0으로 나누는 사고를 막는 하한을 둔다.
  const counterScale = 1 / Math.max(zoom, 0.001);
  const labelStyle = { transform: `scale(${counterScale})`, transformOrigin: 'left center' };

  return (
    <div className={classes.join(' ')}>
      {/* 그룹 접기/펼치기(ADR-0029) 토글을 헤더 안의 평범한 버튼으로 넣었더니, 그룹 프레임과
          같은 위치를 지나는 엣지(특히 넓은 hit-test용 stroke를 가진 react-flow__edge-interaction
          경로)가 클릭을 가로챈다는 게 Playwright 실측으로 드러났다 — 그룹 프레임은 늘 배경에
          있도록 zIndex:-1(toFlow.ts)인데, 엣지는 zIndex 1(같은 그룹)/10(그룹 경계 횡단)이라
          프레임 안의 어떤 자식도 엣지보다 위로 올라올 수 없다(부모가 만든 stacking context를
          못 벗어난다). NodeToolbar는 포탈로 렌더되고 zIndex를 직접 지정할 수 있어 이 문제를
          피한다 — "줌 배율과 무관하게 항상 같은 크기"라는 덤도 얻는다(연구 문서의 NodeToolbar
          장점과 정확히 일치). */}
      <NodeToolbar nodeId={id} isVisible position={Position.Top} align="start" offset={2} style={{ zIndex: 1000 }}>
        <button
          type="button"
          className="group-node__toggle nodrag"
          onClick={onToggleCollapse}
          aria-label={manuallyCollapsed ? '그룹 펼치기' : '그룹 접기'}
        >
          {manuallyCollapsed ? '▸' : '▾'}
        </button>
      </NodeToolbar>
      <div className="group-node__header">
        <span className="group-node__label" style={labelStyle}>
          {label}
        </span>
        <span className="group-node__count" style={labelStyle}>
          {count}
        </span>
      </div>
    </div>
  );
}
