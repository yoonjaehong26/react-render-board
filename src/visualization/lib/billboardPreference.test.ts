import { beforeEach, describe, expect, it } from 'vitest';
import {
  clampBillboardPosition,
  DEFAULT_BILLBOARD_PREFERENCE,
  getStoredBillboardPreference,
  setStoredBillboardPreference,
} from './billboardPreference';

describe('billboardPreference', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to a visible billboard at the top center', () => {
    expect(getStoredBillboardPreference()).toEqual(DEFAULT_BILLBOARD_PREFERENCE);
  });

  it('round-trips visibility and position through localStorage', () => {
    setStoredBillboardPreference({ visible: false, position: { x: 0.2, y: 0.8 } });
    expect(getStoredBillboardPreference()).toEqual({ visible: false, position: { x: 0.2, y: 0.8 } });
  });

  it('clamps positions and rejects malformed values', () => {
    expect(clampBillboardPosition({ x: -1, y: 3 })).toEqual({ x: 0, y: 1 });
    localStorage.setItem('rrb:billboardPreference', JSON.stringify({ visible: true, position: { x: 1 } }));
    expect(getStoredBillboardPreference()).toEqual(DEFAULT_BILLBOARD_PREFERENCE);
  });
});
