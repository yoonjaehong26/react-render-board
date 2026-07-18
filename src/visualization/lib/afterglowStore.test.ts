import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createAfterglowStore,
  AFTERGLOW_BUMP,
  AFTERGLOW_TICK_MS,
} from './afterglowStore';

afterEach(() => {
  vi.useRealTimers();
});

describe('createAfterglowStore', () => {
  it('starts with zero heat everywhere', () => {
    const store = createAfterglowStore();
    expect(store.getHeat(1)).toBe(0);
    store.dispose();
  });

  it('bump raises heat and notifies; repeated bumps accumulate up to a cap of 1', () => {
    vi.useFakeTimers();
    const store = createAfterglowStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.bump([1]);
    expect(store.getHeat(1)).toBeCloseTo(AFTERGLOW_BUMP);
    expect(listener).toHaveBeenCalledTimes(1);

    store.bump([1]);
    store.bump([1]);
    expect(store.getHeat(1)).toBe(1); // capped, not 1.8
    store.dispose();
  });

  it('decays heat over time and eventually drops the node', () => {
    vi.useFakeTimers();
    const store = createAfterglowStore();
    store.bump([1]);
    const initial = store.getHeat(1);

    vi.advanceTimersByTime(AFTERGLOW_TICK_MS);
    expect(store.getHeat(1)).toBeLessThan(initial);
    expect(store.getHeat(1)).toBeGreaterThan(0);

    // after enough ticks it falls below MIN_HEAT and is removed
    vi.advanceTimersByTime(AFTERGLOW_TICK_MS * 100);
    expect(store.getHeat(1)).toBe(0);
    store.dispose();
  });

  it('pause freezes heat: no decay and no new bumps', () => {
    vi.useFakeTimers();
    const store = createAfterglowStore();
    store.bump([1]);
    const frozen = store.getHeat(1);

    store.setPaused(true);
    vi.advanceTimersByTime(AFTERGLOW_TICK_MS * 10);
    expect(store.getHeat(1)).toBe(frozen); // did not decay

    store.bump([1]); // ignored while paused
    expect(store.getHeat(1)).toBe(frozen);

    // resuming lets it decay again
    store.setPaused(false);
    vi.advanceTimersByTime(AFTERGLOW_TICK_MS);
    expect(store.getHeat(1)).toBeLessThan(frozen);
    store.dispose();
  });

  it('clear removes all heat and notifies', () => {
    vi.useFakeTimers();
    const store = createAfterglowStore();
    const listener = vi.fn();
    store.bump([1, 2, 3]);
    store.subscribe(listener);

    store.clear();
    expect(store.getHeat(1)).toBe(0);
    expect(store.getHeat(2)).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
    store.dispose();
  });

  it('getVersion bumps on every notify (bump, decay tick, clear) so edge glow can subscribe to "something changed"', () => {
    vi.useFakeTimers();
    const store = createAfterglowStore();
    const v0 = store.getVersion();

    store.bump([1]);
    const v1 = store.getVersion();
    expect(v1).toBeGreaterThan(v0);

    vi.advanceTimersByTime(AFTERGLOW_TICK_MS); // decay tick notifies
    expect(store.getVersion()).toBeGreaterThan(v1);

    const beforeClear = store.getVersion();
    store.clear();
    expect(store.getVersion()).toBeGreaterThan(beforeClear);
    store.dispose();
  });

  it('tracks group heat on a separate channel (map-mode aggregate flow, ADR-0032 Q2)', () => {
    vi.useFakeTimers();
    const store = createAfterglowStore();

    store.bumpGroups(['group:A', 'group:B']);
    expect(store.getGroupHeat('group:A')).toBeCloseTo(AFTERGLOW_BUMP);
    expect(store.getGroupHeat('group:C')).toBe(0);
    // node heat channel is independent
    expect(store.getHeat(1)).toBe(0);

    // both channels decay together and pause together
    store.setPaused(true);
    const frozen = store.getGroupHeat('group:A');
    vi.advanceTimersByTime(AFTERGLOW_TICK_MS * 5);
    expect(store.getGroupHeat('group:A')).toBe(frozen);

    store.setPaused(false);
    vi.advanceTimersByTime(AFTERGLOW_TICK_MS);
    expect(store.getGroupHeat('group:A')).toBeLessThan(frozen);

    store.clear();
    expect(store.getGroupHeat('group:A')).toBe(0);
    store.dispose();
  });

  it('getHeat stays a stable primitive for unheated nodes (drives useSyncExternalStore skip)', () => {
    vi.useFakeTimers();
    const store = createAfterglowStore();
    store.bump([1]);
    // node 2 was never bumped — its snapshot value must be a constant 0 across ticks
    expect(store.getHeat(2)).toBe(0);
    vi.advanceTimersByTime(AFTERGLOW_TICK_MS);
    expect(store.getHeat(2)).toBe(0);
    store.dispose();
  });
});
