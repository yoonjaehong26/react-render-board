import type { NodeProps } from '@xyflow/react';
import type { GroupNodeData } from '../lib/toFlow';

// ui-philosophy.md의 "영역(region) 기반 그룹핑" — 뭉쳐서 숨기지 않고 회색 박스 경계만 그어준다.
// 실제 컴포넌트 노드는 이 프레임 "안에" 그대로 남아 있다(React Flow parentId/extent:'parent').
export function GroupNode({ data }: NodeProps) {
  const { label, count } = data as GroupNodeData;
  return (
    <div className="group-node">
      <div className="group-node__header">
        <span className="group-node__label">{label}</span>
        <span className="group-node__count">{count}</span>
      </div>
    </div>
  );
}
