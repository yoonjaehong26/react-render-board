import type { NormalizedNode } from './preprocess';

// 스파이크용 레이아웃: dagre/elk 같은 전용 라이브러리 없이 "충분히 안 겹치는" 트리 레이아웃을 직접 짠다.
// 되돌리기 쉬운 영역(ui-philosophy.md 참고)이므로 정교함보다 "빨리 결과를 보는 것"을 우선한다.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GroupLayout {
  group: string;
  frame: Rect;
  nodeIds: string[];
}

export interface LayoutResult {
  groups: GroupLayout[];
  // 각 노드의 "그룹 프레임 기준 상대 좌표" (React Flow의 parentId/extent:'parent'에 바로 쓸 수 있게).
  nodePositions: Map<string, { x: number; y: number }>;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 48;
const H_GAP = 24;
const V_GAP = 56;
const GROUP_PADDING_TOP = 56; // 그룹 라벨 헤더 공간
const GROUP_PADDING = 24;
const GROUP_H_GAP = 80;
const GROUP_V_GAP = 80;
const MAX_ROW_WIDTH = 3400;

/** 부모-자식 관계로 이루어진 (여러 루트를 가질 수 있는) 숲을 타이디 트리 형태로 배치한다. */
function layoutForest(nodeIds: string[], parentOf: Map<string, string | null>) {
  const children = new Map<string, string[]>();
  const nodeSet = new Set(nodeIds);
  const roots: string[] = [];

  for (const id of nodeIds) {
    const parentId = parentOf.get(id) ?? null;
    if (parentId !== null && nodeSet.has(parentId)) {
      const list = children.get(parentId) ?? [];
      list.push(id);
      children.set(parentId, list);
    } else {
      roots.push(id);
    }
  }

  const positions = new Map<string, { x: number; y: number }>();
  let leafCursor = 0;

  function assign(id: string, depth: number): number {
    const kids = children.get(id) ?? [];
    let x: number;
    if (kids.length === 0) {
      x = leafCursor * (NODE_WIDTH + H_GAP);
      leafCursor++;
    } else {
      const childXs = kids.map((c) => assign(c, depth + 1));
      x = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    }
    positions.set(id, { x, y: depth * (NODE_HEIGHT + V_GAP) });
    return x;
  }

  for (const r of roots) assign(r, 0);

  let maxX = 0;
  let maxY = 0;
  for (const { x, y } of positions.values()) {
    maxX = Math.max(maxX, x + NODE_WIDTH);
    maxY = Math.max(maxY, y + NODE_HEIGHT);
  }

  return { positions, width: maxX, height: maxY };
}

export function computeLayout(nodes: NormalizedNode[]): LayoutResult {
  const parentOf = new Map<string, string | null>(nodes.map((n) => [n.id, n.parentId]));
  const byGroup = new Map<string, string[]>();
  for (const n of nodes) {
    const list = byGroup.get(n.group) ?? [];
    list.push(n.id);
    byGroup.set(n.group, list);
  }

  const groupNames = [...byGroup.keys()].sort();
  const nodePositions = new Map<string, { x: number; y: number }>();
  const groups: GroupLayout[] = [];

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const group of groupNames) {
    const ids = byGroup.get(group)!;
    const { positions, width, height } = layoutForest(ids, parentOf);
    for (const [id, pos] of positions) {
      nodePositions.set(id, { x: pos.x + GROUP_PADDING, y: pos.y + GROUP_PADDING_TOP });
    }

    const frameWidth = width + GROUP_PADDING * 2;
    const frameHeight = height + GROUP_PADDING_TOP + GROUP_PADDING;

    if (cursorX + frameWidth > MAX_ROW_WIDTH && cursorX > 0) {
      cursorX = 0;
      cursorY += rowHeight + GROUP_V_GAP;
      rowHeight = 0;
    }

    groups.push({
      group,
      frame: { x: cursorX, y: cursorY, width: frameWidth, height: frameHeight },
      nodeIds: ids,
    });

    cursorX += frameWidth + GROUP_H_GAP;
    rowHeight = Math.max(rowHeight, frameHeight);
  }

  return { groups, nodePositions };
}

export { NODE_WIDTH, NODE_HEIGHT };
