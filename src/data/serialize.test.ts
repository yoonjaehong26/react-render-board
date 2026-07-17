import { describe, it, expect, vi } from 'vitest';
import { getFiberId, type Fiber } from 'bippy';
import { serializeFiberTree } from './serialize';

// bippy tag constants (see fiberInspector.ts/serialize.ts comments for why tag, not displayName,
// is the classification source of truth). Only tag/type/child/sibling/alternate are ever read by
// isHostFiber/isCompositeFiber/getFiberId/getDisplayName, so plain objects stand in for real Fibers.
const HostComponentTag = 5;
const FunctionComponentTag = 0;
const ClassComponentTag = 1;
const FragmentTag = 7; // neither host nor composite: "React internal plumbing"
const HostRootTag = 3; // also plumbing
const ContextConsumerTag = 9; // also plumbing (e.g. Provider/Consumer wrapper)

interface FakeFiber {
  tag: number;
  type: unknown;
  child: FakeFiber | null;
  sibling: FakeFiber | null;
  alternate?: FakeFiber | null;
}

function fiber(tag: number, type: unknown, child: FakeFiber | null = null, sibling: FakeFiber | null = null): FakeFiber {
  return { tag, type, child, sibling };
}

function asFiber(f: FakeFiber): Fiber {
  return f as unknown as Fiber;
}

// A function with .name explicitly stripped — real anonymous functions (e.g. `type: () => {}` in
// an object literal) still get a name inferred by the JS engine, so this is the only reliable way
// to reproduce "no displayName, no name" without relying on syntax tricks.
function namedFn(name: string): () => void {
  const fn = () => {};
  Object.defineProperty(fn, 'name', { value: name });
  return fn;
}

function anonymousFn(): () => void {
  const fn = () => {};
  Object.defineProperty(fn, 'name', { value: '' });
  return fn;
}

describe('serializeFiberTree', () => {
  describe('basic walk', () => {
    it('produces nodes for host and composite fibers with correct id/displayName/kind/parentId', () => {
      const button = fiber(ClassComponentTag, namedFn('Button'));
      const div = fiber(HostComponentTag, 'div', button);
      const app = fiber(FunctionComponentTag, namedFn('App'), div);

      const { nodes } = serializeFiberTree(asFiber(app));

      expect(nodes).toHaveLength(3);
      const [appNode, divNode, buttonNode] = nodes;
      expect(appNode).toMatchObject({ displayName: 'App', kind: 'composite', parentId: null });
      expect(divNode).toMatchObject({ displayName: 'div', kind: 'host', parentId: appNode.id });
      expect(buttonNode).toMatchObject({ displayName: 'Button', kind: 'composite', parentId: divNode.id });
      expect(new Set(nodes.map((n) => n.id)).size).toBe(3);
    });

    it('skips a chain of non-visible fibers as nodes but reconnects the composite below to the nearest visible ancestor (null here)', () => {
      const app = fiber(FunctionComponentTag, namedFn('App'));
      const wrapper = fiber(ContextConsumerTag, null, app); // plumbing wrapping plumbing
      const root = fiber(HostRootTag, null, wrapper); // plumbing

      const { nodes, compositeFibers } = serializeFiberTree(asFiber(root));

      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({ displayName: 'App', kind: 'composite', parentId: null });
      expect(compositeFibers.size).toBe(1);
      expect(compositeFibers.get(nodes[0].id)).toBe(app);
    });

    it('reconnects a mix of non-visible and visible siblings to the same visible ancestor', () => {
      const inner = fiber(FunctionComponentTag, namedFn('Inner'));
      const fragment = fiber(FragmentTag, null, inner); // non-visible, has a visible child
      const span = fiber(HostComponentTag, 'span'); // visible sibling of the non-visible fragment
      fragment.sibling = span;
      const app = fiber(FunctionComponentTag, namedFn('App'), fragment);

      const { nodes } = serializeFiberTree(asFiber(app));

      expect(nodes.map((n) => n.displayName)).toEqual(['App', 'Inner', 'span']);
      const appNode = nodes.find((n) => n.displayName === 'App')!;
      const innerNode = nodes.find((n) => n.displayName === 'Inner')!;
      const spanNode = nodes.find((n) => n.displayName === 'span')!;
      // Both Inner (reconnected through the fragment) and span attach directly to App, not to
      // the never-created fragment node.
      expect(innerNode.parentId).toBe(appNode.id);
      expect(spanNode.parentId).toBe(appNode.id);
    });
  });

  describe('compositeFibers', () => {
    it('contains exactly the composite-kind fiber ids mapped to their original fiber objects', () => {
      const button = fiber(ClassComponentTag, namedFn('Button'));
      const div = fiber(HostComponentTag, 'div', button);
      const app = fiber(FunctionComponentTag, namedFn('App'), div);

      const { nodes, compositeFibers } = serializeFiberTree(asFiber(app));

      const compositeIds = nodes.filter((n) => n.kind === 'composite').map((n) => n.id);
      expect([...compositeFibers.keys()].sort()).toEqual(compositeIds.sort());
      const appNode = nodes.find((n) => n.displayName === 'App')!;
      const buttonNode = nodes.find((n) => n.displayName === 'Button')!;
      expect(compositeFibers.get(appNode.id)).toBe(app);
      expect(compositeFibers.get(buttonNode.id)).toBe(button);
    });
  });

  describe('anonymous composite fibers', () => {
    it('falls back to "(anonymous)" when the function has neither displayName nor name', () => {
      const anon = fiber(FunctionComponentTag, anonymousFn());

      const { nodes } = serializeFiberTree(asFiber(anon));

      expect(nodes).toHaveLength(1);
      expect(nodes[0].displayName).toBe('(anonymous)');
      expect(nodes[0].kind).toBe('composite');
    });
  });

  describe('MAX_DEPTH guard (ADR-0016 P0 regression)', () => {
    it('limits recursion depth along the child direction and warns', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const chainLength = 250;
      let head: FakeFiber | null = null;
      let tail: FakeFiber | null = null;
      for (let i = 0; i < chainLength; i++) {
        const node = fiber(FunctionComponentTag, namedFn(`Comp${i}`));
        if (!head) head = node;
        if (tail) tail.child = node;
        tail = node;
      }

      const { nodes } = serializeFiberTree(asFiber(head!));

      // depth is checked at the *start* of each walk() call (depth 0..200 inclusive = 201 calls,
      // one fiber processed per call since this chain has no siblings) before the guard trips.
      expect(nodes).toHaveLength(201);
      expect(nodes.some((n) => n.displayName === `Comp${chainLength - 1}`)).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    it('does NOT truncate a flat run of >200 siblings and does not warn (the exact bug ADR-0016 fixed)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const siblingCount = 250;
      const parent = fiber(FunctionComponentTag, namedFn('Parent'));
      let head: FakeFiber | null = null;
      let tail: FakeFiber | null = null;
      for (let i = 0; i < siblingCount; i++) {
        const node = fiber(HostComponentTag, 'div');
        if (!head) head = node;
        if (tail) tail.sibling = node;
        tail = node;
      }
      parent.child = head;

      const { nodes } = serializeFiberTree(asFiber(parent));

      expect(nodes).toHaveLength(siblingCount + 1); // parent + every sibling, none dropped
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('circular reference safety', () => {
    it('terminates when a sibling chain cycles back to an already-visited fiber', () => {
      const a = fiber(HostComponentTag, 'a');
      const b = fiber(HostComponentTag, 'b');
      const c = fiber(HostComponentTag, 'c');
      a.sibling = b;
      b.sibling = c;
      c.sibling = a; // cycle back to an already-visited fiber

      const { nodes } = serializeFiberTree(asFiber(a));

      // Terminates (this assertion running at all proves no hang) and stops right after
      // re-meeting the already-visited fiber, rather than dropping the whole chain.
      expect(nodes).toHaveLength(3);
      expect(nodes.map((n) => n.displayName)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('getFiberId stability', () => {
    it('a fiber and its alternate resolve to the same id', () => {
      // Burn id 0 first: bippy's WeakMap-based id cache has an alternate-lookup path that treats
      // an already-assigned id of 0 as "not found" (falsy check), which would reassign a fresh id.
      // Consuming id 0 elsewhere first keeps this assertion independent of that quirk.
      getFiberId(asFiber(fiber(FunctionComponentTag, namedFn('Burn'))));

      const current = fiber(FunctionComponentTag, namedFn('X'));
      const alternate = fiber(FunctionComponentTag, namedFn('X'));
      current.alternate = alternate;
      alternate.alternate = current;

      const id1 = getFiberId(asFiber(current));
      const id2 = getFiberId(asFiber(alternate));
      expect(id2).toBe(id1);
    });
  });
});
