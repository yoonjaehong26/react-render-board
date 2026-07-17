import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ComponentNodeData } from '../lib/toFlow';
import { ROUGH_BORDER_COMPOSITE, ROUGH_BORDER_HOST } from '../lib/roughStyle';

export function ComponentNode({ data }: NodeProps) {
  const { displayName, kind, isAnonymous, crossGroup, pending, highlighted, matched, colorIndex } =
    data as ComponentNodeData;
  const classes = ['component-node', `component-node--${kind}`];
  if (isAnonymous) classes.push('component-node--anonymous');
  if (crossGroup) classes.push('component-node--cross-group');
  if (pending) classes.push('component-node--pending');
  if (highlighted) classes.push('component-node--highlighted');
  if (matched) classes.push('component-node--matched');
  if (colorIndex !== undefined) classes.push(`component-node--palette-${colorIndex}`);

  // Excalidraw풍 손그림 테두리(roughStyle.ts) — NODE_WIDTH/HEIGHT가 모든 컴포넌트 노드에 공통인
  // 고정값이라 미리 계산해 둔 정적 이미지 2종을 kind에 따라 공유한다(노드별 런타임 계산 없음).
  const roughBorder = kind === 'host' ? ROUGH_BORDER_HOST : ROUGH_BORDER_COMPOSITE;

  return (
    <div className={classes.join(' ')} style={{ backgroundImage: roughBorder }}>
      <Handle type="target" position={Position.Top} />
      <span className="component-node__name">{displayName}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
