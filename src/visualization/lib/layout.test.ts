import { describe, it, expect } from 'vitest';
import { createLayoutEngine, NODE_WIDTH } from './layout';
import { PENDING_GROUP } from './normalize';
import type { VisibleNode } from './normalize';

function vnode(id: number, group: string, parentId: number | null = null): VisibleNode {
  return {
    id,
    displayName: `Node${id}`,
    kind: 'composite',
    parentId,
    group,
    isAnonymous: false,
  };
}

describe('createLayoutEngine / computeLayout', () => {
  it('buckets nodes into their group and produces a position for every node', () => {
    const engine = createLayoutEngine();
    const nodes = [vnode(1, 'A'), vnode(2, 'A', 1), vnode(3, 'B')];
    const { groups, nodePositions } = engine.computeLayout(nodes);

    expect(groups).toHaveLength(2);
    const a = groups.find((g) => g.group === 'A')!;
    const b = groups.find((g) => g.group === 'B')!;
    expect(a.nodeIds.sort()).toEqual([1, 2]);
    expect(b.nodeIds).toEqual([3]);
    expect(a.frame.width).toBeGreaterThan(0);
    expect(a.frame.height).toBeGreaterThan(0);
    expect(nodePositions.has(1)).toBe(true);
    expect(nodePositions.has(2)).toBe(true);
    expect(nodePositions.has(3)).toBe(true);
  });

  it('positions children lower than their parent and keeps siblings from overlapping', () => {
    const engine = createLayoutEngine();
    const nodes = [vnode(1, 'A'), vnode(2, 'A', 1), vnode(3, 'A', 1)];
    const { nodePositions } = engine.computeLayout(nodes);

    const p1 = nodePositions.get(1)!;
    const p2 = nodePositions.get(2)!;
    const p3 = nodePositions.get(3)!;
    expect(p2.y).toBeGreaterThan(p1.y);
    expect(p3.y).toBeGreaterThan(p1.y);
    expect(p2.x).not.toBe(p3.x);
  });

  it('keeps known groups in their original relative order and appends newly-seen groups after them', () => {
    const engine = createLayoutEngine();
    const call1 = engine.computeLayout([vnode(1, 'A'), vnode(2, 'B')]);
    expect(call1.groups.map((g) => g.group)).toEqual(['A', 'B']);

    const call2 = engine.computeLayout([vnode(1, 'A'), vnode(2, 'B'), vnode(3, 'C')]);
    expect(call2.groups.map((g) => g.group)).toEqual(['A', 'B', 'C']);

    const [a, b, c] = call2.groups;
    expect(a.frame.x).toBeLessThan(b.frame.x);
    expect(b.frame.x).toBeLessThan(c.frame.x);
  });

  // ADR-0018: a group that disappears must be pruned from the remembered order, so
  // that if it reappears later it's treated as new (appended at the end) instead of
  // snapping back into its old slot — otherwise the camera keeps drifting away from
  // genuinely new groups after routing.
  it('treats a group that disappeared and reappeared as new, appending it at the end instead of its old slot', () => {
    const engine = createLayoutEngine();
    const call1 = engine.computeLayout([vnode(1, 'A'), vnode(2, 'B'), vnode(3, 'C')]);
    expect(call1.groups.map((g) => g.group)).toEqual(['A', 'B', 'C']);

    engine.computeLayout([vnode(1, 'A'), vnode(3, 'C')]); // B disappears entirely

    const call3 = engine.computeLayout([vnode(1, 'A'), vnode(2, 'B'), vnode(3, 'C')]);
    expect(call3.groups.map((g) => g.group)).toEqual(['A', 'C', 'B']);
  });

  it('reuses an unchanged group internal layout (value-identical positions) when only another group changes', () => {
    const engine = createLayoutEngine();
    const aNodes = [vnode(1, 'A'), vnode(2, 'A', 1)];

    const call1 = engine.computeLayout([...aNodes, vnode(10, 'B')]);
    const aPositionsBefore = { p1: call1.nodePositions.get(1)!, p2: call1.nodePositions.get(2)! };

    // B's membership changes; A's node ids and parent-of relationships stay identical.
    const call2 = engine.computeLayout([...aNodes, vnode(10, 'B'), vnode(11, 'B', 10)]);
    const aPositionsAfter = { p1: call2.nodePositions.get(1)!, p2: call2.nodePositions.get(2)! };

    expect(aPositionsAfter.p1).toEqual(aPositionsBefore.p1);
    expect(aPositionsAfter.p2).toEqual(aPositionsBefore.p2);
  });

  it('recomputes a group internal layout when its parent-of relationships change even with the same node count', () => {
    const engine = createLayoutEngine();
    const call1 = engine.computeLayout([vnode(1, 'A'), vnode(2, 'A', 1), vnode(3, 'A', 1)]);
    const rootDepthY = call1.nodePositions.get(1)!.y; // node 1 is root (depth 0)
    const childDepthY = call1.nodePositions.get(2)!.y; // node 2 is a child (depth 1)
    expect(childDepthY).toBeGreaterThan(rootDepthY);

    // Same 3 ids, but node 2 is now the root and node 1 is its child — signature
    // (id:parentId pairs) differs even though the node count is unchanged.
    const call2 = engine.computeLayout([vnode(1, 'A', 2), vnode(2, 'A'), vnode(3, 'A', 2)]);
    expect(call2.nodePositions.get(2)!.y).toBe(rootDepthY); // node 2 is now at depth 0
    expect(call2.nodePositions.get(1)!.y).toBe(childDepthY); // node 1 moved to depth 1
  });

  it('cleans up a stale group cache entry so a reappearing group with a different structure does not leak old positions', () => {
    const engine = createLayoutEngine();
    engine.computeLayout([vnode(1, 'A'), vnode(10, 'B'), vnode(11, 'B', 10)]);
    engine.computeLayout([vnode(1, 'A')]); // B disappears entirely

    // B reappears with completely different node ids and structure.
    const call3 = engine.computeLayout([vnode(1, 'A'), vnode(20, 'B'), vnode(21, 'B', 20), vnode(22, 'B', 20)]);
    const b = call3.groups.find((g) => g.group === 'B')!;
    expect(b.nodeIds.sort()).toEqual([20, 21, 22]);
    expect(call3.nodePositions.has(10)).toBe(false);
    expect(call3.nodePositions.has(11)).toBe(false);
    // 21/22 are children of root 20, freshly laid out — not stale positions from old B.
    expect(call3.nodePositions.get(21)!.y).toBeGreaterThan(call3.nodePositions.get(20)!.y);
    expect(call3.nodePositions.get(22)!.y).toBe(call3.nodePositions.get(21)!.y);
  });

  it('always orders the PENDING_GROUP bucket last, regardless of when it first appeared', () => {
    const engine = createLayoutEngine();
    engine.computeLayout([vnode(1, 'A')]);
    const call2 = engine.computeLayout([vnode(1, 'A'), vnode(2, PENDING_GROUP)]);
    expect(call2.groups.map((g) => g.group)).toEqual(['A', PENDING_GROUP]);

    // PENDING_GROUP appears first in the input array, and a new group B is introduced too.
    const call3 = engine.computeLayout([vnode(2, PENDING_GROUP), vnode(1, 'A'), vnode(3, 'B')]);
    expect(call3.groups.map((g) => g.group)).toEqual(['A', 'B', PENDING_GROUP]);
  });

  // ADR-0034: groups are laid out as a waterfall by their cross-group parent depth.
  // When a node in group A is the parent of a node in group B, A "renders" B, so B's
  // frame must sit in a lower band (larger y) than A's.
  it('places a child group in a lower band than its cross-group parent (waterfall)', () => {
    const engine = createLayoutEngine();
    // node 1 (group A) -> node 2 (group B): A renders B.
    const { groups } = engine.computeLayout([vnode(1, 'A'), vnode(2, 'B', 1)]);
    const a = groups.find((g) => g.group === 'A')!;
    const b = groups.find((g) => g.group === 'B')!;
    expect(b.frame.y).toBeGreaterThan(a.frame.y);
  });

  it('stacks a three-level group chain into three descending bands', () => {
    const engine = createLayoutEngine();
    // A -> B -> C chain across groups.
    const { groups } = engine.computeLayout([
      vnode(1, 'A'),
      vnode(2, 'B', 1),
      vnode(3, 'C', 2),
    ]);
    const a = groups.find((g) => g.group === 'A')!;
    const b = groups.find((g) => g.group === 'B')!;
    const c = groups.find((g) => g.group === 'C')!;
    expect(b.frame.y).toBeGreaterThan(a.frame.y);
    expect(c.frame.y).toBeGreaterThan(b.frame.y);
  });

  it('keeps sibling groups (same parent) in the same band, ordered left-to-right by first appearance', () => {
    const engine = createLayoutEngine();
    // A renders both B and C; B and C are siblings at the same depth.
    const { groups } = engine.computeLayout([
      vnode(1, 'A'),
      vnode(2, 'B', 1),
      vnode(3, 'C', 1),
    ]);
    const b = groups.find((g) => g.group === 'B')!;
    const c = groups.find((g) => g.group === 'C')!;
    expect(b.frame.y).toBe(c.frame.y); // same band
    expect(b.frame.x).toBeLessThan(c.frame.x); // first-appearance order preserved
  });

  it('places a shared (multi-parent) group once, in the deepest band among its parents (option A)', () => {
    const engine = createLayoutEngine();
    // A -> B (B at depth 1). A -> C, C -> D, so D is at depth 2 via C.
    // D also rendered directly by B (depth 1) — longest path wins → D sits below C.
    const { groups } = engine.computeLayout([
      vnode(1, 'A'),
      vnode(2, 'B', 1),
      vnode(3, 'C', 1),
      vnode(4, 'D', 3), // D rendered by C (depth 1) → D depth 2
      vnode(5, 'D', 2), // D also rendered by B (depth 1) → still depth 2 (max)
    ]);
    const dFrames = groups.filter((g) => g.group === 'D');
    expect(dFrames).toHaveLength(1); // placed once, not duplicated
    const a = groups.find((g) => g.group === 'A')!;
    const c = groups.find((g) => g.group === 'C')!;
    const d = dFrames[0];
    expect(c.frame.y).toBeGreaterThan(a.frame.y);
    expect(d.frame.y).toBeGreaterThan(c.frame.y);
  });

  it('does not loop forever when groups form a cross-group cycle', () => {
    const engine = createLayoutEngine();
    // A -> B and B -> A (a node in each group parents a node in the other): a cycle.
    // The back-edge is broken so every group still gets a finite band.
    const { groups } = engine.computeLayout([
      vnode(1, 'A'),
      vnode(2, 'B', 1), // A renders B
      vnode(3, 'A', 2), // B renders A (cycle)
    ]);
    expect(groups.map((g) => g.group).sort()).toEqual(['A', 'B']);
    for (const g of groups) expect(Number.isFinite(g.frame.y)).toBe(true);
  });

  it('computes a sane positive frame width for a group with many siblings', () => {
    const engine = createLayoutEngine();
    const nodes = Array.from({ length: 5 }, (_, i) => vnode(i + 1, 'A'));
    const { groups } = engine.computeLayout(nodes);
    const a = groups[0];
    const expectedWidth = 5 * NODE_WIDTH + 4 * 24 + 24 * 2; // 5 leaves, H_GAP=24, GROUP_PADDING=24
    expect(a.frame.width).toBe(expectedWidth);
  });
});

// ── 폴더 단위 2단 중첩(ADR-0053) ──
function pnode(id: number, group: string, groupPath: string, parentId: number | null = null): VisibleNode {
  return { id, displayName: `Node${id}`, kind: 'composite', parentId, group, groupPath, isAnonymous: false };
}

describe('computeLayout with nestFolders', () => {
  it('returns folders: [] and byte-identical groups when nestFolders is off', () => {
    const engine = createLayoutEngine();
    const nodes = [
      pnode(1, 'Panel.tsx', '/src/dataflow/Panel.tsx'),
      pnode(2, 'Demo.tsx', '/src/dataflow/Demo.tsx'),
    ];
    const flat = engine.computeLayout(nodes);
    expect(flat.folders).toEqual([]);
    // 같은 엔진이 아닌 새 엔진으로도 동일해야 한다(순서 상태 격리).
    const flat2 = createLayoutEngine().computeLayout(nodes);
    expect(flat2.folders).toEqual([]);
    expect(flat2.groups.map((g) => ({ group: g.group, frame: g.frame }))).toEqual(
      flat.groups.map((g) => ({ group: g.group, frame: g.frame })),
    );
  });

  it('wraps ≥2 file-groups sharing a folder into one folder frame, and tags them with parentFolder', () => {
    const engine = createLayoutEngine();
    const nodes = [
      pnode(1, 'Panel.tsx', '/src/domains/dataflow/Panel.tsx'),
      pnode(2, 'Demo.tsx', '/src/domains/dataflow/Demo.tsx'),
    ];
    const { groups, folders } = engine.computeLayout(nodes, { nestFolders: true });

    expect(folders).toHaveLength(1);
    const folder = folders[0];
    expect(folder.folder).toBe('/src/domains/dataflow');
    expect(folder.groupKeys.sort()).toEqual(['Demo.tsx', 'Panel.tsx']);

    for (const g of groups) expect(g.parentFolder).toBe('/src/domains/dataflow');

    // 파일 프레임은 폴더 프레임 안(월드 좌표)에 완전히 들어가야 한다.
    for (const g of groups) {
      expect(g.frame.x).toBeGreaterThanOrEqual(folder.frame.x);
      expect(g.frame.y).toBeGreaterThanOrEqual(folder.frame.y);
      expect(g.frame.x + g.frame.width).toBeLessThanOrEqual(folder.frame.x + folder.frame.width + 0.01);
      expect(g.frame.y + g.frame.height).toBeLessThanOrEqual(folder.frame.y + folder.frame.height + 0.01);
    }
  });

  it('does NOT create a folder frame for a folder with a single file-group', () => {
    const engine = createLayoutEngine();
    const nodes = [
      pnode(1, 'Solo.tsx', '/src/solo/Solo.tsx'),
      pnode(2, 'A.tsx', '/src/pair/A.tsx'),
      pnode(3, 'B.tsx', '/src/pair/B.tsx'),
    ];
    const { groups, folders } = engine.computeLayout(nodes, { nestFolders: true });

    expect(folders.map((f) => f.folder)).toEqual(['/src/pair']);
    expect(groups.find((g) => g.group === 'Solo.tsx')!.parentFolder).toBeUndefined();
    expect(groups.find((g) => g.group === 'A.tsx')!.parentFolder).toBe('/src/pair');
  });

  it('treats groups without a groupPath (and PENDING) as lone top-level units', () => {
    const engine = createLayoutEngine();
    const nodes = [
      pnode(1, 'A.tsx', '/src/pair/A.tsx'),
      pnode(2, 'B.tsx', '/src/pair/B.tsx'),
      vnode(3, 'NoPath.tsx'), // groupPath 없음
      vnode(4, PENDING_GROUP),
    ];
    const { groups, folders } = engine.computeLayout(nodes, { nestFolders: true });
    expect(folders).toHaveLength(1);
    expect(groups.find((g) => g.group === 'NoPath.tsx')!.parentFolder).toBeUndefined();
    expect(groups.find((g) => g.group === PENDING_GROUP)!.parentFolder).toBeUndefined();
  });

  it('keeps a folder in place when a second file appears (folder inherits its earliest file slot)', () => {
    const engine = createLayoutEngine();
    // 처음엔 pair 폴더에 파일 1개 → 폴더 없음, 단독 그룹.
    engine.computeLayout(
      [pnode(1, 'A.tsx', '/src/pair/A.tsx'), pnode(2, 'Z.tsx', '/src/zzz/Z.tsx')],
      { nestFolders: true },
    );
    // 두번째 파일 등장 → 폴더 생성. A가 먼저 등장했으므로 폴더는 A 자리(맨 앞)를 물려받아 Z보다 앞.
    const { folders } = engine.computeLayout(
      [
        pnode(1, 'A.tsx', '/src/pair/A.tsx'),
        pnode(3, 'B.tsx', '/src/pair/B.tsx'),
        pnode(2, 'Z.tsx', '/src/zzz/Z.tsx'),
      ],
      { nestFolders: true },
    );
    expect(folders).toHaveLength(1);
    expect(folders[0].folder).toBe('/src/pair');
  });
});

// ── downfall 부모 앵커 배치(ADR-0058) ──
describe('computeLayout parent-anchored placement', () => {
  it('places children under their parents x (reduces crossings)', () => {
    // P1(root), P2(root); C1은 P2가 렌더, C2는 P1이 렌더. 처음 등장 순서는 [P1,P2,C1,C2].
    // barycenter 없으면 밴드1 = [C1,C2](C1이 왼쪽) → C1(부모 P2=오른쪽) 아래가 어긋나 교차.
    // barycenter면 밴드1 = [C2,C1] → C2(부모 P1=왼쪽), C1(부모 P2=오른쪽)로 정렬돼 교차 감소.
    const engine = createLayoutEngine();
    const nodes = [
      vnode(1, 'P1'),
      vnode(2, 'P2'),
      vnode(3, 'C1', 2), // P2 renders C1
      vnode(4, 'C2', 1), // P1 renders C2
    ];
    const { groups } = engine.computeLayout(nodes);
    const x = (g: string) => groups.find((gg) => gg.group === g)!.frame.x;
    expect(x('P1')).toBeLessThan(x('P2')); // 최상위 밴드는 groupOrder 유지
    expect(x('C2')).toBeLessThan(x('C1')); // 자식은 부모 아래로 재정렬(C2<C1)
  });

  it('keeps the top band in groupOrder (stable anchor) and is deterministic across commits', () => {
    const engine = createLayoutEngine();
    const nodes = [vnode(1, 'P1'), vnode(2, 'P2'), vnode(3, 'C1', 2), vnode(4, 'C2', 1)];
    const first = engine.computeLayout(nodes).groups.map((g) => g.group);
    const second = engine.computeLayout(nodes).groups.map((g) => g.group);
    expect(second).toEqual(first); // 같은 트리 → 같은 순서(안정)
    // 최상위 밴드(P1,P2)는 groupOrder 그대로.
    const topBand = first.filter((g) => g === 'P1' || g === 'P2');
    expect(topBand).toEqual(['P1', 'P2']);
  });

  it('does not reorder when a band has a single group or no cross-group parents', () => {
    const engine = createLayoutEngine();
    // 전부 루트(부모 관계 없음) → 재정렬 없이 groupOrder 유지.
    const { groups } = engine.computeLayout([vnode(1, 'A'), vnode(2, 'B'), vnode(3, 'C')]);
    expect(groups.map((g) => g.group)).toEqual(['A', 'B', 'C']);
  });

  it('orders child groups by the actual parent-component render anchors, not their first-seen group order', () => {
    // Parent 파일 안에서 LeftSource가 먼저, RightSource가 나중에 렌더된다. 자식 그룹의 첫 등장은
    // 반대로 RightChild → LeftChild지만, waterfall은 실제 출발 컴포넌트 순서대로 놓아야 교차하지 않는다.
    const engine = createLayoutEngine();
    const { groups, nodePositions } = engine.computeLayout([
      vnode(1, 'Parent'),
      vnode(2, 'Parent', 1), // LeftSource (파일 내부 왼쪽)
      vnode(3, 'Parent', 1), // RightSource (파일 내부 오른쪽)
      vnode(4, 'RightChild', 3), // 의도적으로 먼저 등장
      vnode(5, 'LeftChild', 2),
    ]);
    const frame = (group: string) => groups.find((g) => g.group === group)!.frame;
    const center = (group: string) => {
      const f = frame(group);
      return f.x + f.width / 2;
    };
    const parent = frame('Parent');
    const leftSource = parent.x + nodePositions.get(2)!.x + 80;
    const rightSource = parent.x + nodePositions.get(3)!.x + 80;

    expect(center('LeftChild')).toBeLessThan(center('RightChild'));
    expect(Math.abs(center('LeftChild') - leftSource)).toBeLessThan(
      Math.abs(center('LeftChild') - rightSource),
    );
    expect(Math.abs(center('RightChild') - rightSource)).toBeLessThan(
      Math.abs(center('RightChild') - leftSource),
    );
  });

  it('moves a shared (multi-parent) group to the shared lane below the tree (pillar ②)', () => {
    const engine = createLayoutEngine();
    // C는 P1과 P2 둘 다 렌더(공유 컴포넌트) → 다중 부모. 공유 UI 레인(pillar ②)은 이걸 트리에서
    // 빼 아래 별도 레인 밴드에 둔다(남은 트리 순수화). shared 플래그 + 사용처 수(parentCount).
    const nodes = [
      vnode(1, 'P1'),
      vnode(2, 'P2'),
      vnode(3, 'C', 1), // P1 renders (a node in) C
      vnode(4, 'C', 2), // P2 renders (another node in) C
    ];
    const { groups } = engine.computeLayout(nodes);
    const c = groups.find((g) => g.group === 'C')!;
    const p1 = groups.find((g) => g.group === 'P1')!;
    const p2 = groups.find((g) => g.group === 'P2')!;
    // C는 공유로 표시되고 사용처 2곳.
    expect(c.shared).toBe(true);
    expect(c.parentCount).toBe(2);
    // 레인은 트리 맨 아래 밴드보다 더 아래 → C.y가 부모(루트 밴드)보다 아래.
    expect(c.frame.y).toBeGreaterThan(p1.frame.y);
    // 부모들은 트리(공유 아님)라 순수 트리로 남는다.
    expect(p1.shared).toBeFalsy();
    expect(p2.shared).toBeFalsy();
    // 레인 배치는 부모들의 x 중심(centroid) 아래 → 사용선이 화면을 안 가로지르고 부모 근처에 온다.
    const cx = (g: (typeof groups)[number]) => g.frame.x + g.frame.width / 2;
    expect(cx(c)).toBeCloseTo((cx(p1) + cx(p2)) / 2, 0);
  });

  it('자식 있는 공유 컨테이너(증분2): 컨테이너+서브트리를 통째로 레인에 미니 트리로', () => {
    const engine = createLayoutEngine();
    // S = 공유 컨테이너(P1·P2 둘 다 렌더 = 다중 부모), C = S가 렌더하는 자식 그룹.
    // 증분2: S를 레인으로 빼면서 C(서브트리)도 레인에 S 아래로 함께 옮긴다(고아 방지).
    const { groups } = engine.computeLayout([
      vnode(1, 'P1'),
      vnode(2, 'P2'),
      vnode(3, 'S', 1), // P1 renders S
      vnode(4, 'S', 2), // P2 renders S → S 다중 부모
      vnode(5, 'C', 3), // S renders C → C의 부모 그룹 = S
    ]);
    const s = groups.find((g) => g.group === 'S')!;
    const c = groups.find((g) => g.group === 'C')!;
    const p1 = groups.find((g) => g.group === 'P1')!;
    // S는 공유(배지 대상), C는 레인 자식(공유 아님 — 컨테이너 내용물).
    expect(s.shared).toBe(true);
    expect(c.shared).toBeFalsy();
    // 둘 다 레인(부모 밴드보다 아래), C는 S보다 한 밴드 더 아래(미니 트리 깊이 1).
    expect(s.frame.y).toBeGreaterThan(p1.frame.y);
    expect(c.frame.y).toBeGreaterThan(s.frame.y);
    // C는 S 아래에 대략 정렬(고아로 흩어지지 않음).
    const cx = (g: (typeof groups)[number]) => g.frame.x + g.frame.width / 2;
    expect(cx(c)).toBeCloseTo(cx(s), 0);
  });

  it('centers a parent over its children span (no rightward drift)', () => {
    const engine = createLayoutEngine();
    // P가 자식 3개(C1,C2,C3)를 렌더 → P는 C1..C3 스팬 중앙 위. P 중심이 가운데 자식(C2) 근처.
    const nodes = [
      vnode(1, 'P'),
      vnode(2, 'C1', 1),
      vnode(3, 'C2', 1),
      vnode(4, 'C3', 1),
    ];
    const { groups } = engine.computeLayout(nodes);
    const center = (g: string) => {
      const f = groups.find((gg) => gg.group === g)!.frame;
      return f.x + f.width / 2;
    };
    const cP = center('P');
    // 부모 중심이 첫 자식과 끝 자식 사이(중앙) — 왼쪽 끝에 걸리지 않는다.
    expect(cP).toBeGreaterThan(center('C1'));
    expect(cP).toBeLessThan(center('C3'));
    expect(cP).toBeCloseTo(center('C2'), 0); // 가운데 자식과 거의 정렬
  });

  it('reserves direct-child width for upper parents while resolving the child-band collision', () => {
    const engine = createLayoutEngine();
    // A의 자식 C는 파일 내부에 넓은 형제 행을 가진다. B를 A 바로 옆에 붙이면 C의 폭/후손이
    // B 가지 아래로 파고들어 서로 다른 부모 간선이 다시 교차할 수 있다. B는 A의 *프레임*이
    // 아니라 C까지 포함한 서브트리 폭 뒤에 배치되어야 한다.
    const { groups } = engine.computeLayout([
      vnode(1, 'A'),
      vnode(2, 'B'),
      vnode(3, 'C', 1),
      vnode(4, 'C', 3),
      vnode(5, 'C', 3),
      vnode(6, 'C', 3),
      vnode(7, 'D', 2),
    ]);
    const frame = (group: string) => groups.find((g) => g.group === group)!.frame;
    const c = frame('C');
    const b = frame('B');
    const d = frame('D');

    // B는 직접 자식 D의 폭만큼, A는 직접 자식 C의 폭만큼 예약한다. 따라서 넓은 C가 있는
    // A와 B는 처음부터 분리돼 각 parent→child 관계가 자기 수직 corridor를 갖는다.
    expect(b.x).toBeGreaterThanOrEqual(c.x + c.width);
    expect(d.x).toBeGreaterThanOrEqual(c.x + c.width);
  });

  it('spreads sibling parent components by the widths of the files they directly render', () => {
    const engine = createLayoutEngine();
    // Parent 안의 SourceWide와 SourceNarrow는 둘 다 leaf지만, 전자가 직접 렌더하는 Wide 파일은
    // 내부 형제 3개로 넓다. 읽기 우선 기본값에서는 그 직접 자식 frame 폭을 source 슬롯에
    // 반영해 두 source 사이에 처음부터 수직 corridor를 만든다.
    const { groups, nodePositions } = engine.computeLayout([
      vnode(1, 'Parent'),
      vnode(2, 'Parent', 1),
      vnode(3, 'Parent', 1),
      vnode(4, 'Wide', 2),
      vnode(5, 'Wide', 4),
      vnode(6, 'Wide', 4),
      vnode(7, 'Wide', 4),
      vnode(8, 'Narrow', 3),
    ]);
    const wide = groups.find((g) => g.group === 'Wide')!;
    const narrow = groups.find((g) => g.group === 'Narrow')!;
    const parent = groups.find((g) => g.group === 'Parent')!;
    const sourceWide = nodePositions.get(2)!;
    const sourceNarrow = nodePositions.get(3)!;

    expect(wide.frame.width).toBeGreaterThan(narrow.frame.width);
    expect(sourceNarrow.x - sourceWide.x).toBeGreaterThan(NODE_WIDTH + 100);
    expect(narrow.frame.x).toBeGreaterThanOrEqual(wide.frame.x + wide.frame.width);
    // strict waterfall: 자식 파일이 하나인 source는 자식 frame 중심과 정확히 같은 x를 쓴다.
    expect(wide.frame.x + wide.frame.width / 2).toBeCloseTo(parent.frame.x + sourceWide.x + NODE_WIDTH / 2, 6);
    expect(narrow.frame.x + narrow.frame.width / 2).toBeCloseTo(parent.frame.x + sourceNarrow.x + NODE_WIDTH / 2, 6);
  });

  it('does not propagate a grandchild file width into an ancestor source slot', () => {
    const engine = createLayoutEngine();
    // Parent의 두 source는 Child와 Peer를 직접 렌더한다. Child 안쪽에서 Grand가 매우 넓어져도
    // Parent는 Grand가 아니라 Child의 기본 frame 폭만 예약해야 재귀적 가로 폭 폭발을 막는다.
    const { groups, nodePositions } = engine.computeLayout([
      vnode(1, 'Parent'),
      vnode(2, 'Parent', 1),
      vnode(3, 'Parent', 1),
      vnode(4, 'Child', 2),
      vnode(5, 'Child', 4),
      vnode(6, 'Grand', 5),
      vnode(7, 'Grand', 6),
      vnode(8, 'Grand', 6),
      vnode(9, 'Grand', 6),
      vnode(10, 'Peer', 3),
    ]);
    const grand = groups.find((g) => g.group === 'Grand')!;
    const nestedSource = nodePositions.get(2)!;
    const peerSource = nodePositions.get(3)!;

    expect(grand.frame.width).toBeGreaterThan(NODE_WIDTH * 2);
    expect(peerSource.x - nestedSource.x).toBeLessThan(grand.frame.width);
  });
});
