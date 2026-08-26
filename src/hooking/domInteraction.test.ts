import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Fiber } from 'bippy';

vi.mock('bippy', () => ({
  getDisplayName: vi.fn(),
  getFiberFromHostInstance: vi.fn(),
  getFiberId: vi.fn(),
  getNearestHostFibers: vi.fn(),
  isCompositeFiber: vi.fn(() => false),
}));

// isDevEnvironment을 모킹한다(ADR-0067) — vitest는 이미 트랜스파일된 모듈을 거쳐 참조하는
// import.meta.env.DEV/process.env.NODE_ENV를 vi.stubEnv로 안정적으로 "false"로 못 만든다
// (devEnvironment.test.ts 참고). startDomClickBridge가 isDevEnvironment()의 반환값을 그대로
// 따르는지가 이 테스트들의 관심사이므로, 그 의존성 자체를 모킹해 결정적으로 만든다.
vi.mock('./devEnvironment', () => ({ isDevEnvironment: vi.fn(() => true) }));

import { getFiberFromHostInstance, getFiberId, getNearestHostFibers } from 'bippy';
import { findFiberIdForElement, resolveHostElements, startDomClickBridge } from './domInteraction';
import { isDevEnvironment } from './devEnvironment';
import type { InteractionSnapshot, InteractionStore } from '../visualization/lib/interactionStore';

const mockedGetFiberFromHostInstance = vi.mocked(getFiberFromHostInstance);
const mockedGetFiberId = vi.mocked(getFiberId);
const mockedGetNearestHostFibers = vi.mocked(getNearestHostFibers);
const mockedIsDevEnvironment = vi.mocked(isDevEnvironment);

// Stateful (not just vi.fn()-stubbed) so tests can assert setPickMode() actually flips what a
// later getSnapshot() call sees — the auto-off-after-pick behavior depends on that round trip.
function fakeInteractionStore(overrides: Partial<InteractionSnapshot> = {}): InteractionStore {
  let snapshot: InteractionSnapshot = {
    boardOpen: false,
    highlightedElements: [],
    hoverElements: [],
    hoverNodeId: null,
    hoverTarget: null,
    selectedTarget: null,
    navigateToNodeId: null,
    navigateRequestId: 0,
    autoPlacementRequestId: 0,
    pickModeActive: false,
    ...overrides,
  };
  return {
    subscribe: vi.fn(() => () => {}),
    getSnapshot: vi.fn(() => snapshot),
    setBoardOpen: vi.fn(),
    highlight: vi.fn(),
    setHoverElements: vi.fn(),
    selectTarget: vi.fn(),
    clearSelectedTarget: vi.fn(),
    requestNavigate: vi.fn(),
    consumeNavigate: vi.fn(),
    setPickMode: vi.fn((active: boolean) => {
      snapshot = { ...snapshot, pickModeActive: active };
    }),
  };
}

beforeEach(() => {
  mockedGetFiberFromHostInstance.mockReset();
  mockedGetFiberId.mockReset();
  mockedGetNearestHostFibers.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('findFiberIdForElement', () => {
  it('returns getFiberId(fiber) when a fiber is found for the element', () => {
    const el = document.createElement('div');
    const fiber = {} as Fiber;
    mockedGetFiberFromHostInstance.mockReturnValue(fiber);
    mockedGetFiberId.mockReturnValue(42);

    expect(findFiberIdForElement(el)).toBe(42);
    expect(mockedGetFiberFromHostInstance).toHaveBeenCalledWith(el);
    expect(mockedGetFiberId).toHaveBeenCalledWith(fiber);
  });

  it('returns null when no fiber is found for the element', () => {
    mockedGetFiberFromHostInstance.mockReturnValue(null);
    expect(findFiberIdForElement(document.createElement('div'))).toBeNull();
    expect(mockedGetFiberId).not.toHaveBeenCalled();
  });
});

describe('resolveHostElements', () => {
  it('maps the nearest host fibers to their stateNode Elements', () => {
    const elA = document.createElement('div');
    const elB = document.createElement('span');
    mockedGetNearestHostFibers.mockReturnValue([{ stateNode: elA } as Fiber, { stateNode: elB } as Fiber]);

    expect(resolveHostElements({} as Fiber)).toEqual([elA, elB]);
  });

  it('filters out stateNodes that are not real DOM Elements (e.g. text instances)', () => {
    const el = document.createElement('div');
    mockedGetNearestHostFibers.mockReturnValue([
      { stateNode: el } as Fiber,
      { stateNode: 'a text instance, not an Element' } as unknown as Fiber,
      { stateNode: null } as unknown as Fiber,
    ]);

    expect(resolveHostElements({} as Fiber)).toEqual([el]);
  });
});

describe('startDomClickBridge', () => {
  it('does not attach a listener and returns a no-op unsubscribe when not in a dev environment', () => {
    mockedIsDevEnvironment.mockReturnValueOnce(false);
    const container = document.createElement('div');
    const addSpy = vi.spyOn(container, 'addEventListener');
    const interactionStore = fakeInteractionStore();

    const unsubscribe = startDomClickBridge(container, interactionStore);

    expect(addSpy).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  // The original design reacted to every click, which turned out to hijack ordinary app
  // interactions (verify.mjs caught this: clicking "항목 추가" zoomed the board into that
  // button instead of just adding an item). It's now gated to explicit "I want to pick an
  // element" signals only: Alt(⌥)+click, or interactionStore.pickModeActive.
  it('does nothing on a plain click (no Alt, pick mode off) — must not hijack ordinary app interactions', () => {
    const container = document.createElement('div');
    const child = document.createElement('button');
    container.appendChild(child);
    document.body.appendChild(container);

    mockedGetFiberFromHostInstance.mockReturnValue({} as Fiber);
    mockedGetFiberId.mockReturnValue(7);
    const interactionStore = fakeInteractionStore();
    startDomClickBridge(container, interactionStore);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    child.dispatchEvent(clickEvent);

    expect(interactionStore.requestNavigate).not.toHaveBeenCalled();
    expect(interactionStore.highlight).not.toHaveBeenCalled();
    expect(clickEvent.defaultPrevented).toBe(false);

    document.body.removeChild(container);
  });

  it('Alt+click resolves the id and requests navigation + highlight, and blocks the app’s own handling of that click', () => {
    const container = document.createElement('div');
    const child = document.createElement('button');
    container.appendChild(child);
    document.body.appendChild(container);

    const fiber = {} as Fiber;
    mockedGetFiberFromHostInstance.mockReturnValue(fiber);
    mockedGetFiberId.mockReturnValue(7);
    const interactionStore = fakeInteractionStore();
    startDomClickBridge(container, interactionStore);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true });
    child.dispatchEvent(clickEvent);

    expect(interactionStore.requestNavigate).toHaveBeenCalledWith(7);
    expect(interactionStore.highlight).toHaveBeenCalledWith([child]);
    expect(interactionStore.selectTarget).toHaveBeenCalledWith(
      expect.objectContaining({ tagName: 'button', role: 'button' }),
    );
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(interactionStore.setPickMode).not.toHaveBeenCalled(); // Alt+click never touches pick mode

    document.body.removeChild(container);
  });

  it('a plain click while pickModeActive is on also picks, blocks the click, and auto-turns pick mode off afterward', () => {
    const container = document.createElement('div');
    const child = document.createElement('button');
    container.appendChild(child);
    document.body.appendChild(container);

    mockedGetFiberFromHostInstance.mockReturnValue({} as Fiber);
    mockedGetFiberId.mockReturnValue(9);
    const interactionStore = fakeInteractionStore({ pickModeActive: true });
    startDomClickBridge(container, interactionStore);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    child.dispatchEvent(clickEvent);

    expect(interactionStore.requestNavigate).toHaveBeenCalledWith(9);
    expect(interactionStore.selectTarget).toHaveBeenCalledWith(
      expect.objectContaining({ tagName: 'button', role: 'button' }),
    );
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(interactionStore.setPickMode).toHaveBeenCalledWith(false);
    expect(interactionStore.getSnapshot().pickModeActive).toBe(false);

    document.body.removeChild(container);
  });

  it('still blocks the click and turns pick mode off even when no fiber id can be resolved', () => {
    const container = document.createElement('div');
    const child = document.createElement('button');
    container.appendChild(child);

    mockedGetFiberFromHostInstance.mockReturnValue(null);
    const interactionStore = fakeInteractionStore({ pickModeActive: true });
    startDomClickBridge(container, interactionStore);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    child.dispatchEvent(clickEvent);

    expect(interactionStore.requestNavigate).not.toHaveBeenCalled();
    expect(interactionStore.highlight).not.toHaveBeenCalled();
    expect(interactionStore.selectTarget).toHaveBeenCalledWith(
      expect.objectContaining({ tagName: 'button', role: 'button' }),
    );
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(interactionStore.setPickMode).toHaveBeenCalledWith(false);
  });

  it('catches an error thrown while resolving a pick and logs it instead of letting it propagate', () => {
    const container = document.createElement('div');
    const child = document.createElement('button');
    container.appendChild(child);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockedGetFiberFromHostInstance.mockImplementation(() => {
      throw new Error('boom');
    });
    const interactionStore = fakeInteractionStore();

    startDomClickBridge(container, interactionStore);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true });
    expect(() => child.dispatchEvent(clickEvent)).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('listens in the capture phase, so it can intercept before React’s own bubble-phase delegated handlers run', () => {
    const container = document.createElement('div');
    const addSpy = vi.spyOn(container, 'addEventListener');
    startDomClickBridge(container, fakeInteractionStore());

    expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function), true);
  });

  it('the returned unsubscribe function stops the bridge from reacting to further Alt+clicks', () => {
    const container = document.createElement('div');
    const child = document.createElement('button');
    container.appendChild(child);

    mockedGetFiberFromHostInstance.mockReturnValue({} as Fiber);
    mockedGetFiberId.mockReturnValue(1);
    const interactionStore = fakeInteractionStore();

    const unsubscribe = startDomClickBridge(container, interactionStore);
    unsubscribe();

    child.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));

    expect(interactionStore.requestNavigate).not.toHaveBeenCalled();
  });
});
