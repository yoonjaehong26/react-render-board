import type { Edge, Node } from '@xyflow/react';
import type { NormalizedNode } from './preprocess';
import { computeLayout, NODE_HEIGHT, NODE_WIDTH } from './layout';

export interface ComponentNodeData extends Record<string, unknown> {
  displayName: string;
  kind: 'host' | 'composite';
  isAnonymous: boolean;
  crossGroup: boolean;
}

export interface GroupNodeData extends Record<string, unknown> {
  label: string;
  count: number;
}

export function toFlow(nodes: NormalizedNode[]): { flowNodes: Node[]; flowEdges: Edge[] } {
  const { groups, nodePositions } = computeLayout(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const flowNodes: Node[] = [];

  for (const g of groups) {
    flowNodes.push({
      id: `group:${g.group}`,
      type: 'group',
      position: { x: g.frame.x, y: g.frame.y },
      style: { width: g.frame.width, height: g.frame.height },
      data: { label: g.group, count: g.nodeIds.length } satisfies GroupNodeData,
      selectable: false,
      draggable: false,
      zIndex: -1,
    });
  }

  for (const g of groups) {
    for (const id of g.nodeIds) {
      const n = byId.get(id)!;
      const pos = nodePositions.get(id)!;
      const parent = n.parentId ? byId.get(n.parentId) : null;
      const crossGroup = !!parent && parent.group !== n.group;

      flowNodes.push({
        id: n.id,
        type: 'component',
        parentId: `group:${g.group}`,
        extent: 'parent',
        position: pos,
        style: { width: NODE_WIDTH, height: NODE_HEIGHT },
        data: {
          displayName: n.displayName,
          kind: n.kind,
          isAnonymous: n.isAnonymous,
          crossGroup,
        } satisfies ComponentNodeData,
      });
    }
  }

  const flowEdges: Edge[] = nodes
    .filter((n) => n.parentId !== null)
    .map((n) => {
      const parent = byId.get(n.parentId!)!;
      const crossGroup = parent.group !== n.group;
      return {
        id: `${n.parentId}->${n.id}`,
        source: n.parentId!,
        target: n.id,
        type: 'smoothstep',
        className: crossGroup ? 'edge-cross-group' : undefined,
        zIndex: crossGroup ? 10 : 1,
      } satisfies Edge;
    });

  return { flowNodes, flowEdges };
}
