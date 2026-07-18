import { describe, it, expect, beforeEach } from 'vitest';
import {
  clampLayout,
  defaultLayout,
  getStoredPropsPanelLayout,
  setStoredPropsPanelLayout,
  MIN_PANEL_WIDTH,
  MIN_PANEL_HEIGHT,
  PANEL_MARGIN,
} from './propsPanelPreference';

describe('propsPanelPreference', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to a right-aligned panel that does not fill the full height', () => {
    const l = defaultLayout(1000, 600);
    expect(l.width).toBe(280);
    expect(l.x).toBe(1000 - 280 - PANEL_MARGIN); // 우측 정렬
    expect(l.y).toBe(PANEL_MARGIN);
    // 세로를 꽉 채우지 않아 "크기 조절 가능한 창"임이 드러난다(하단 여백 존재).
    expect(l.height).toBe(Math.round(600 * 0.6));
    expect(l.height).toBeLessThan(600 - PANEL_MARGIN * 2);
  });

  it('clamps size to the minimum and keeps the panel on-screen', () => {
    const tiny = clampLayout({ x: -500, y: -500, width: 10, height: 10 }, 800, 600);
    expect(tiny.width).toBe(MIN_PANEL_WIDTH);
    expect(tiny.height).toBe(MIN_PANEL_HEIGHT);
    expect(tiny.x).toBeGreaterThanOrEqual(PANEL_MARGIN);
    expect(tiny.y).toBeGreaterThanOrEqual(PANEL_MARGIN);
  });

  it('clamps position so the panel does not overflow the right/bottom edge', () => {
    const l = clampLayout({ x: 9999, y: 9999, width: 300, height: 200 }, 800, 600);
    expect(l.x + l.width).toBeLessThanOrEqual(800 - PANEL_MARGIN);
    expect(l.y + l.height).toBeLessThanOrEqual(600 - PANEL_MARGIN);
  });

  it('round-trips through localStorage', () => {
    setStoredPropsPanelLayout({ x: 40, y: 50, width: 320, height: 400 });
    expect(getStoredPropsPanelLayout()).toEqual({ x: 40, y: 50, width: 320, height: 400 });
  });

  it('returns null for missing or malformed storage', () => {
    expect(getStoredPropsPanelLayout()).toBeNull();
    localStorage.setItem('rrb:propsPanelLayout', '{"x":1}');
    expect(getStoredPropsPanelLayout()).toBeNull();
  });
});
