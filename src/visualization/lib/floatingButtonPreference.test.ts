import { beforeEach, describe, expect, it } from 'vitest';
import {
  clampPosition,
  DEFAULT_FLOATING_BUTTON_POSITION,
  getStoredFloatingButtonPosition,
  setStoredFloatingButtonPosition,
} from './floatingButtonPreference';

describe('floatingButtonPreference', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to the bottom-right corner', () => {
    expect(getStoredFloatingButtonPosition()).toEqual(DEFAULT_FLOATING_BUTTON_POSITION);
  });

  it('round-trips a position through localStorage', () => {
    setStoredFloatingButtonPosition({ x: 0.25, y: 0.7 });
    expect(getStoredFloatingButtonPosition()).toEqual({ x: 0.25, y: 0.7 });
  });

  it('clamps positions to the reachable viewport range', () => {
    expect(clampPosition({ x: -1, y: 3 })).toEqual({ x: 0, y: 1 });
    setStoredFloatingButtonPosition({ x: -1, y: 3 });
    expect(getStoredFloatingButtonPosition()).toEqual({ x: 0, y: 1 });
  });

  it('falls back for malformed or non-finite stored values', () => {
    localStorage.setItem('rrb:floatingButtonPosition', '{"x":1}');
    expect(getStoredFloatingButtonPosition()).toEqual(DEFAULT_FLOATING_BUTTON_POSITION);
    expect(clampPosition({ x: Number.NaN, y: Number.POSITIVE_INFINITY })).toEqual(DEFAULT_FLOATING_BUTTON_POSITION);
  });
});
