import { describe, it, expect, vi, afterEach } from 'vitest';
import { createInteractionStore, HIGHLIGHT_DURATION_MS } from './interactionStore';

afterEach(() => {
  vi.useRealTimers();
});

describe('createInteractionStore', () => {
  it('starts closed, with no highlight and no pending navigation', () => {
    const store = createInteractionStore();
    expect(store.getSnapshot()).toEqual({
      boardOpen: false,
      highlightedElements: [],
      navigateToNodeId: null,
      navigateRequestId: 0,
      pickModeActive: false,
    });
  });

  describe('setBoardOpen', () => {
    it('updates boardOpen and notifies subscribers', () => {
      const store = createInteractionStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.setBoardOpen(true);

      expect(store.getSnapshot().boardOpen).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('highlight', () => {
    it('sets highlightedElements and auto-clears after HIGHLIGHT_DURATION_MS', () => {
      vi.useFakeTimers();
      const store = createInteractionStore();
      const el = document.createElement('div');

      store.highlight([el]);
      expect(store.getSnapshot().highlightedElements).toEqual([el]);

      vi.advanceTimersByTime(HIGHLIGHT_DURATION_MS - 1);
      expect(store.getSnapshot().highlightedElements).toEqual([el]);

      vi.advanceTimersByTime(1);
      expect(store.getSnapshot().highlightedElements).toEqual([]);
    });

    it('replaces an in-flight highlight and restarts the timer, rather than stacking', () => {
      vi.useFakeTimers();
      const store = createInteractionStore();
      const first = document.createElement('div');
      const second = document.createElement('span');

      store.highlight([first]);
      vi.advanceTimersByTime(HIGHLIGHT_DURATION_MS - 100);
      store.highlight([second]); // should reset the clock

      vi.advanceTimersByTime(HIGHLIGHT_DURATION_MS - 100);
      // if the first timer had not been cleared, it would have fired by now and cleared this
      expect(store.getSnapshot().highlightedElements).toEqual([second]);

      vi.advanceTimersByTime(100);
      expect(store.getSnapshot().highlightedElements).toEqual([]);
    });
  });

  describe('requestNavigate / consumeNavigate', () => {
    it('requestNavigate opens the board and sets navigateToNodeId', () => {
      const store = createInteractionStore();
      store.requestNavigate(42);
      expect(store.getSnapshot()).toMatchObject({ boardOpen: true, navigateToNodeId: 42 });
    });

    it('consumeNavigate resets navigateToNodeId to null without touching boardOpen', () => {
      const store = createInteractionStore();
      store.requestNavigate(42);
      store.consumeNavigate();
      expect(store.getSnapshot()).toMatchObject({ boardOpen: true, navigateToNodeId: null });
    });

    it('consumeNavigate is a no-op (no notify) when there is nothing pending', () => {
      const store = createInteractionStore();
      const listener = vi.fn();
      store.subscribe(listener);
      store.consumeNavigate();
      expect(listener).not.toHaveBeenCalled();
    });

    it('bumps navigateRequestId on every requestNavigate call, even for the same rawId twice in a row (docking panel lets this really happen, ADR-0025)', () => {
      const store = createInteractionStore();
      store.requestNavigate(7);
      const firstRequestId = store.getSnapshot().navigateRequestId;

      store.consumeNavigate();
      store.requestNavigate(7); // same id again — Canvas's effect must still re-fire

      expect(store.getSnapshot().navigateRequestId).toBe(firstRequestId + 1);
      expect(store.getSnapshot().navigateToNodeId).toBe(7);
    });
  });

  describe('setPickMode', () => {
    it('toggles pickModeActive and notifies subscribers', () => {
      const store = createInteractionStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.setPickMode(true);
      expect(store.getSnapshot().pickModeActive).toBe(true);

      store.setPickMode(false);
      expect(store.getSnapshot().pickModeActive).toBe(false);
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('subscribe', () => {
    it('supports multiple independent listeners and clean unsubscribe', () => {
      const store = createInteractionStore();
      const a = vi.fn();
      const b = vi.fn();
      store.subscribe(a);
      const unsubB = store.subscribe(b);

      store.setBoardOpen(true);
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);

      unsubB();
      store.setBoardOpen(false);
      expect(a).toHaveBeenCalledTimes(2);
      expect(b).toHaveBeenCalledTimes(1);
    });
  });
});
