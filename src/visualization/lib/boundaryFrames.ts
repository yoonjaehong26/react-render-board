// 경계(포탈/Suspense/에러 바운더리)를 "이름표 붙은 프레임"으로 그린다(도형 어휘, ADR-0028 —
// 표현 방식은 사용자 결정: 노드 뱃지 대신 감싸는 영역을 박스로 두름). roleMarkers.ts가 파생한
// "노드→경계 소속"을 받아, 같은 경계에 속한(그리고 같은 그룹 안에 있는) 노드들의 바운딩 박스에
// 프레임 노드 하나씩을 만든다.
//
// 왜 (그룹, 경계)별인가: 컴포넌트 노드는 이미 그룹 프레임에 parentId로 매여 있어 좌표가 그룹
// 기준이다. 경계 프레임도 같은 그룹의 자식으로 만들면 좌표계가 일치하고 z-순서(그룹 프레임 위,
// 컴포넌트 노드 아래)를 배열 순서로 제어할 수 있다. 한 경계가 여러 그룹에 걸치면 그룹마다 프레임을
// 하나씩 만든다(각각 이름표) — 드문 경우라 이 단순화를 택한다.
import type { Node } from '@xyflow/react';
import { NODE_WIDTH, NODE_HEIGHT } from './layout';
import type { BoundaryMembership, RoleMarker } from './roleMarkers';

export interface BoundaryFrameData extends Record<string, unknown> {
  kind: RoleMarker;
}

const PAD = 12; // 멤버 노드에서 프레임 경계까지 여백(좌/우/하)
// 상단은 더 크게 띄운다: 그룹은 첫 자식이 헤더 아래(layout.GROUP_PADDING_TOP=56)에서 시작하므로
// 그룹 라벨(상단)과 첫 멤버 사이에 빈 띠가 있다. 이름표를 프레임 안쪽 상단(이 띠)에 넣어 그룹
// 라벨과 세로로 분리 → 겹치지 않는다. 프레임 자신이 헤더를 침범하지 않도록 이 값을 56 미만으로 둔다.
const TOP_INSET = 24;

interface Cluster {
  kind: RoleMarker;
  parentId: string | undefined;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 렌더된 컴포넌트 노드(flowNodes)와 경계 소속(memberships)으로 경계 프레임 노드를 만든다.
 * 프레임은 멤버가 속한 그룹의 자식으로 두고(parentId 공유), 멤버 바운딩 박스에 여백/이름표
 * 공간을 더한 크기로 그린다.
 */
export function buildBoundaryFrames(
  flowNodes: Node[],
  memberships: ReadonlyMap<number, BoundaryMembership>,
): Node[] {
  if (memberships.size === 0) return [];
  const clusters = new Map<string, Cluster>();

  for (const n of flowNodes) {
    if (n.type !== 'component') continue;
    const mem = memberships.get(Number(n.id));
    if (!mem) continue;
    const key = `${n.parentId ?? ''}|${mem.boundaryId}`;
    const x = n.position.x;
    const y = n.position.y;
    const w = (n.style?.width as number | undefined) ?? NODE_WIDTH;
    const h = (n.style?.height as number | undefined) ?? NODE_HEIGHT;
    const c =
      clusters.get(key) ??
      ({ kind: mem.kind, parentId: n.parentId, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity } as Cluster);
    c.minX = Math.min(c.minX, x);
    c.minY = Math.min(c.minY, y);
    c.maxX = Math.max(c.maxX, x + w);
    c.maxY = Math.max(c.maxY, y + h);
    clusters.set(key, c);
  }

  const frames: Node[] = [];
  for (const [key, c] of clusters) {
    frames.push({
      id: `boundary:${key}`,
      type: 'boundary',
      parentId: c.parentId,
      position: { x: c.minX - PAD, y: c.minY - TOP_INSET },
      style: { width: c.maxX - c.minX + PAD * 2, height: c.maxY - c.minY + TOP_INSET + PAD },
      data: { kind: c.kind } satisfies BoundaryFrameData,
      selectable: false,
      draggable: false,
      zIndex: 0,
    });
  }
  return frames;
}

/**
 * 그룹 프레임 바로 뒤(그 그룹의 컴포넌트 노드 앞)에 경계 프레임을 끼워 넣은 새 배열을 만든다.
 * 같은 그룹의 자식들 사이에서 배열 순서가 곧 그리는 순서라, 이렇게 넣으면 경계 프레임이 그룹
 * 프레임 위·컴포넌트 노드 아래에 깔린다(멤버 노드를 덮지 않는다).
 */
// 경계 종류의 표준 순서(동심 링 순서를 일관되게). 안쪽→바깥쪽으로 이 순서를 쓴다.
const KIND_ORDER: RoleMarker[] = ['portal', 'suspense', 'errorBoundary'];

/**
 * 각 그룹이 어떤 경계 종류를 품고 있는지 집계한다(wideview 그룹 링용). 노드 소속(memberships)과
 * 노드→그룹 매핑으로 그룹별 종류 집합을 만들고, 표준 순서로 정렬해 돌려준다.
 */
export function computeGroupBoundaryKinds(
  memberships: ReadonlyMap<number, BoundaryMembership>,
  nodeGroup: ReadonlyMap<number, string>,
): Map<string, RoleMarker[]> {
  const sets = new Map<string, Set<RoleMarker>>();
  for (const [id, mem] of memberships) {
    const group = nodeGroup.get(id);
    if (group === undefined) continue;
    (sets.get(group) ?? sets.set(group, new Set()).get(group)!).add(mem.kind);
  }
  const out = new Map<string, RoleMarker[]>();
  for (const [group, set] of sets) out.set(group, KIND_ORDER.filter((k) => set.has(k)));
  return out;
}

/** 그룹 노드의 data에 boundaryKinds를 채워 넣는다(GroupNode가 동심 링을 그린다). 불변 갱신. */
export function withGroupBoundaryKinds(
  nodes: Node[],
  groupKinds: ReadonlyMap<string, RoleMarker[]>,
): Node[] {
  if (groupKinds.size === 0) return nodes;
  return nodes.map((n) => {
    if (n.type !== 'group') return n;
    const group = String(n.id).replace(/^group:/, '');
    const kinds = groupKinds.get(group);
    if (!kinds) return n;
    return { ...n, data: { ...n.data, boundaryKinds: kinds } };
  });
}

export function insertBoundaryFrames(flowNodes: Node[], frames: Node[]): Node[] {
  if (frames.length === 0) return flowNodes;
  const byParent = new Map<string, Node[]>();
  for (const f of frames) {
    const key = f.parentId ?? '';
    (byParent.get(key) ?? byParent.set(key, []).get(key)!).push(f);
  }
  const out: Node[] = [];
  for (const n of flowNodes) {
    out.push(n);
    if (n.type === 'group') {
      const group = byParent.get(n.id);
      if (group) out.push(...group);
    }
  }
  return out;
}
