import { useViewport, type NodeProps } from '@xyflow/react';
import type { GroupNodeData } from '../lib/toFlow';

// ui-philosophy.md의 "영역(region) 기반 그룹핑" — 뭉쳐서 숨기지 않고 회색 박스 경계만 그어준다.
// 실제 컴포넌트 노드는 이 프레임 "안에" 그대로 남아 있다(React Flow parentId/extent:'parent').

// 지도 모드 LOD (ADR-0016 ②): minZoom을 크게 낮춰(0.05 → 0.001) fitView가 대규모 콘텐츠를
// 바닥에 막히지 않고 실제로 전부 담게 했더니, 이번엔 CSS `.zoom-far` 폰트 크기 고정값(20px)이
// 캔버스 자체의 transform: scale(zoom)에 함께 눌려 1~5% 줌에서는 사실상 안 보이는 크기가
// 됐다(ADR-0014가 지적한 "라벨 텍스트가 읽을 수 없어짐"). 라벨에 캔버스 줌의 역수를 곱해
// 화면 기준 크기를 고정한다 — 그룹 프레임 자체는 월드 좌표대로 계속 줄어들어(그래야 지도가
// 성립한다) fitView 배치는 그대로 유지하면서, 텍스트만 항상 읽을 수 있는 크기를 유지한다.
export function GroupNode({ data }: NodeProps) {
  const { label, count, pending, collapsed } = data as GroupNodeData;
  const { zoom } = useViewport();
  const classes = ['group-node'];
  if (pending) classes.push('group-node--pending');
  if (collapsed) classes.push('group-node--collapsed');

  // zoom은 minZoom(0.001) 아래로 내려가지 않지만, 짧은 전환 애니메이션 도중 관측치가
  // 그보다 살짝 흔들릴 수 있어 0으로 나누는 사고를 막는 하한을 둔다.
  const counterScale = 1 / Math.max(zoom, 0.001);
  const labelStyle = { transform: `scale(${counterScale})`, transformOrigin: 'left center' };

  return (
    <div className={classes.join(' ')}>
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
