import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ComponentNodeData } from '../lib/toFlow';

export function ComponentNode({ data }: NodeProps) {
  const { displayName, kind, isAnonymous, crossGroup } = data as ComponentNodeData;
  const classes = ['component-node', `component-node--${kind}`];
  if (isAnonymous) classes.push('component-node--anonymous');
  if (crossGroup) classes.push('component-node--cross-group');

  return (
    <div className={classes.join(' ')}>
      <Handle type="target" position={Position.Top} />
      <span className="component-node__name">{displayName}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
