import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Fiber } from 'bippy';

vi.mock('./serialize', () => ({ serializeFiberTree: vi.fn() }));
vi.mock('./sourceHints', () => ({ resolveGroupHints: vi.fn() }));

import { serializeFiberTree } from './serialize';
import { resolveGroupHints } from './sourceHints';
import { createRenderStore } from './store';
import type { RenderNode } from './types';

const mockedSerializeFiberTree = vi.mocked(serializeFiberTree);
const mockedResolveGroupHints = vi.mocked(resolveGroupHints);

function node(overrides: Partial<RenderNode> = {}): RenderNode {
  return { id: 1, displayName: 'App', kind: 'composite', parentId: null, groupHint: null, ...overrides };
}

beforeEach(() => {
  mockedSerializeFiberTree.mockReset();
  mockedResolveGroupHints.mockReset();
  mockedSerializeFiberTree.mockReturnValue({ nodes: [], compositeFibers: new Map(), fibersById: new Map() });
  // Sane default so an incidental call (a test that doesn't care about hint resolution) doesn't
  // call .then() on undefined.
  mockedResolveGroupHints.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('createRenderStore', () => {
  describe('handleCommit', () => {
    it('synchronously updates getSnapshot(): commitId increments and nodes reflect the serialized result immediately', () => {
      const store = createRenderStore();
      expect(store.getSnapshot()).toEqual({ commitId: 0, nodes: [] });

      const nodesA = [node({ id: 1 })];
      mockedSerializeFiberTree.mockReturnValueOnce({ nodes: nodesA, compositeFibers: new Map(), fibersById: new Map() });
      store.handleCommit({} as Fiber);

      expect(store.getSnapshot().commitId).toBe(1);
      expect(store.getSnapshot().nodes).toEqual(nodesA);

      const nodesB = [node({ id: 1 }), node({ id: 2, displayName: 'Button' })];
      mockedSerializeFiberTree.mockReturnValueOnce({ nodes: nodesB, compositeFibers: new Map(), fibersById: new Map() });
      store.handleCommit({} as Fiber);

      expect(store.getSnapshot().commitId).toBe(2);
      expect(store.getSnapshot().nodes).toEqual(nodesB);
    });
  });

  describe('notify debouncing', () => {
    it('coalesces rapid handleCommit calls into a single notify after the debounce window (jsdom has no requestIdleCallback, exercising the setTimeout fallback)', () => {
      expect(typeof requestIdleCallback).toBe('undefined');
      vi.useFakeTimers();

      const nodesA = [node({ displayName: 'A' })];
      const nodesB = [node({ displayName: 'B' })];
      const nodesC = [node({ displayName: 'C' })];
      mockedSerializeFiberTree
        .mockReturnValueOnce({ nodes: nodesA, compositeFibers: new Map(), fibersById: new Map() })
        .mockReturnValueOnce({ nodes: nodesB, compositeFibers: new Map(), fibersById: new Map() })
        .mockReturnValueOnce({ nodes: nodesC, compositeFibers: new Map(), fibersById: new Map() });

      const store = createRenderStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.handleCommit({} as Fiber);
      store.handleCommit({} as Fiber);
      store.handleCommit({} as Fiber);

      expect(listener).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot().nodes).toEqual(nodesC);
    });
  });

  describe('groupHint caching', () => {
    it('applies a cached hint synchronously on a later commit, without calling resolveGroupHints again for that id', async () => {
      const fiberA = {} as Fiber;
      mockedSerializeFiberTree.mockReturnValueOnce({
        nodes: [node({ id: 5 })],
        compositeFibers: new Map([[5, fiberA]]),
        fibersById: new Map([[5, fiberA]]),
      });
      mockedResolveGroupHints.mockResolvedValueOnce([{ id: 5, groupHint: 'src/App.tsx', groupPath: null }]);

      const store = createRenderStore();
      store.handleCommit({} as Fiber);

      // Let the resolveGroupHints().then() microtask (and the notify it may schedule) flush.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockedResolveGroupHints).toHaveBeenCalledTimes(1);

      mockedSerializeFiberTree.mockReturnValueOnce({
        nodes: [node({ id: 5 })], // groupHint: null again, as if freshly serialized
        compositeFibers: new Map([[5, fiberA]]),
        fibersById: new Map([[5, fiberA]]),
      });
      store.handleCommit({} as Fiber);

      expect(store.getSnapshot().nodes[0].groupHint).toBe('src/App.tsx');
      expect(mockedResolveGroupHints).toHaveBeenCalledTimes(1); // not called again for id 5
    });

    it('only calls resolveGroupHints for composite ids not already cached, across two commits', async () => {
      const fiberA = {} as Fiber;
      const fiberB = {} as Fiber;
      mockedResolveGroupHints.mockResolvedValueOnce([{ id: 1, groupHint: 'a.tsx', groupPath: null }]);
      mockedSerializeFiberTree.mockReturnValueOnce({
        nodes: [node({ id: 1 })],
        compositeFibers: new Map([[1, fiberA]]),
        fibersById: new Map([[1, fiberA]]),
      });

      const store = createRenderStore();
      store.handleCommit({} as Fiber);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockedResolveGroupHints).toHaveBeenNthCalledWith(1, new Map([[1, fiberA]]));

      mockedResolveGroupHints.mockResolvedValueOnce([{ id: 2, groupHint: 'b.tsx', groupPath: null }]);
      mockedSerializeFiberTree.mockReturnValueOnce({
        nodes: [node({ id: 1 }), node({ id: 2, displayName: 'Button' })],
        compositeFibers: new Map([
          [1, fiberA],
          [2, fiberB],
        ]),
        fibersById: new Map([
          [1, fiberA],
          [2, fiberB],
        ]),
      });
      store.handleCommit({} as Fiber);

      expect(mockedResolveGroupHints).toHaveBeenCalledTimes(2);
      expect(mockedResolveGroupHints).toHaveBeenNthCalledWith(2, new Map([[2, fiberB]]));
    });

    it('retries a timed-out groupHint on later commits, then gives up and caches null after the budget (ADR-0073)', async () => {
      const fiberA = {} as Fiber;
      const serializeOnce = () =>
        mockedSerializeFiberTree.mockReturnValueOnce({
          nodes: [node({ id: 1 })],
          compositeFibers: new Map([[1, fiberA]]),
          fibersById: new Map([[1, fiberA]]),
        });

      const store = createRenderStore();

      // MAX_GROUP_HINT_TIMEOUT_RETRIES(2) + 확정 1회 = 3번 연속 타임아웃. 캐시 안 되므로 매 커밋
      // 다시 pending으로 잡혀 재해석된다(전이적 경합 타임아웃 회복 경로).
      for (let i = 0; i < 3; i++) {
        mockedResolveGroupHints.mockResolvedValueOnce([{ id: 1, groupHint: null, groupPath: null, timedOut: true }]);
        serializeOnce();
        store.handleCommit({} as Fiber);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(mockedResolveGroupHints).toHaveBeenCalledTimes(i + 1);
      }

      // 예산 소진 → null로 확정 캐시 → 다음 커밋에선 더 이상 재해석하지 않는다(genuine hang 수렴).
      serializeOnce();
      store.handleCommit({} as Fiber);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockedResolveGroupHints).toHaveBeenCalledTimes(3);
    });

    it('caches a groupHint that resolves after an earlier timeout and stops retrying (ADR-0073)', async () => {
      const fiberA = {} as Fiber;
      const serializeOnce = () =>
        mockedSerializeFiberTree.mockReturnValueOnce({
          nodes: [node({ id: 1 })],
          compositeFibers: new Map([[1, fiberA]]),
          fibersById: new Map([[1, fiberA]]),
        });

      const store = createRenderStore();

      mockedResolveGroupHints.mockResolvedValueOnce([{ id: 1, groupHint: null, groupPath: null, timedOut: true }]);
      serializeOnce();
      store.handleCommit({} as Fiber);
      await new Promise((resolve) => setTimeout(resolve, 0));

      // 재시도에서 성공적으로 resolve → 캐시되고 재시도 카운터가 정리된다.
      mockedResolveGroupHints.mockResolvedValueOnce([{ id: 1, groupHint: 'src/App.tsx', groupPath: null }]);
      serializeOnce();
      store.handleCommit({} as Fiber);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(store.getSnapshot().nodes[0].groupHint).toBe('src/App.tsx');

      // 이제 캐시 히트 → 세 번째 커밋에선 재해석하지 않는다.
      serializeOnce();
      store.handleCommit({} as Fiber);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockedResolveGroupHints).toHaveBeenCalledTimes(2);
    });

    it('does not schedule a follow-up notify when the resolved groupHint matches what is already in the snapshot', async () => {
      mockedResolveGroupHints.mockResolvedValueOnce([{ id: 1, groupHint: null, groupPath: null }]); // same as node()'s default
      mockedSerializeFiberTree.mockReturnValueOnce({
        nodes: [node({ id: 1 })],
        compositeFibers: new Map([[1, {} as Fiber]]),
        fibersById: new Map(),
      });

      const store = createRenderStore();
      const listener = vi.fn();
      store.subscribe(listener);
      store.handleCommit({} as Fiber);

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Only the synchronous scheduleNotify() from handleCommit itself fires; the .then()
      // callback computed changed=false and did not schedule a second one.
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribe', () => {
    it('supports multiple independent listeners', () => {
      vi.useFakeTimers();
      const store = createRenderStore();
      const listenerA = vi.fn();
      const listenerB = vi.fn();
      store.subscribe(listenerA);
      const unsubscribeB = store.subscribe(listenerB);

      store.handleCommit({} as Fiber);
      vi.runAllTimers();

      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(1);

      unsubscribeB();
      store.handleCommit({} as Fiber);
      vi.runAllTimers();

      expect(listenerA).toHaveBeenCalledTimes(2);
      expect(listenerB).toHaveBeenCalledTimes(1); // no longer subscribed
    });

    it('cancels the pending scheduled notify when the last listener unsubscribes', () => {
      vi.useFakeTimers();
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const store = createRenderStore();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      store.handleCommit({} as Fiber);
      unsubscribe();

      expect(clearTimeoutSpy).toHaveBeenCalled();

      vi.runAllTimers();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('getFiber', () => {
    it('returns the Fiber for an id captured in the latest commit', () => {
      const fiberA = {} as Fiber;
      mockedSerializeFiberTree.mockReturnValueOnce({
        nodes: [node({ id: 1 })],
        compositeFibers: new Map(),
        fibersById: new Map([[1, fiberA]]),
      });

      const store = createRenderStore();
      store.handleCommit({} as Fiber);

      expect(store.getFiber(1)).toBe(fiberA);
    });

    it('returns undefined for an id that never existed', () => {
      const store = createRenderStore();
      expect(store.getFiber(999)).toBeUndefined();
    });

    it('replaces (not accumulates) fibersById on the next commit — a stale id from a prior commit resolves to undefined', () => {
      const fiberA = {} as Fiber;
      mockedSerializeFiberTree.mockReturnValueOnce({
        nodes: [node({ id: 1 })],
        compositeFibers: new Map(),
        fibersById: new Map([[1, fiberA]]),
      });
      const store = createRenderStore();
      store.handleCommit({} as Fiber);
      expect(store.getFiber(1)).toBe(fiberA);

      const fiberB = {} as Fiber;
      mockedSerializeFiberTree.mockReturnValueOnce({
        nodes: [node({ id: 2 })],
        compositeFibers: new Map(),
        fibersById: new Map([[2, fiberB]]),
      });
      store.handleCommit({} as Fiber);

      expect(store.getFiber(1)).toBeUndefined();
      expect(store.getFiber(2)).toBe(fiberB);
    });
  });

  describe('dev-only gating', () => {
    it('does not call resolveGroupHints when import.meta.env.DEV is false', () => {
      vi.stubEnv('DEV', false);
      mockedSerializeFiberTree.mockReturnValueOnce({
        nodes: [node({ id: 1 })],
        compositeFibers: new Map([[1, {} as Fiber]]),
        fibersById: new Map(),
      });

      const store = createRenderStore();
      store.handleCommit({} as Fiber);

      expect(mockedResolveGroupHints).not.toHaveBeenCalled();
    });
  });
});
