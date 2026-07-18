import { describe, it, expect, beforeEach } from 'vitest';
import {
  clampFraction,
  getStoredPanelLayout,
  setStoredPanelLayout,
  DEFAULT_PANEL_LAYOUT,
  MIN_PANEL_FRACTION,
  MAX_PANEL_FRACTION,
} from './panelLayoutPreference';

beforeEach(() => {
  localStorage.clear();
});

describe('panelLayoutPreference', () => {
  it('returns the default layout when nothing is stored', () => {
    expect(getStoredPanelLayout()).toEqual(DEFAULT_PANEL_LAYOUT);
  });

  it('round-trips a stored layout', () => {
    setStoredPanelLayout({ dock: 'left', sizeFraction: 0.5 });
    expect(getStoredPanelLayout()).toEqual({ dock: 'left', sizeFraction: 0.5 });
  });

  it('clamps an out-of-range fraction on read', () => {
    setStoredPanelLayout({ dock: 'right', sizeFraction: 5 }); // absurdly large
    const layout = getStoredPanelLayout();
    expect(layout.dock).toBe('right');
    expect(layout.sizeFraction).toBe(MAX_PANEL_FRACTION);
  });

  it('falls back to default for a malformed dock value', () => {
    localStorage.setItem('rrb:panelLayout', JSON.stringify({ dock: 'diagonal', sizeFraction: 0.4 }));
    expect(getStoredPanelLayout()).toEqual(DEFAULT_PANEL_LAYOUT);
  });

  it('falls back to default for non-JSON garbage', () => {
    localStorage.setItem('rrb:panelLayout', 'not json');
    expect(getStoredPanelLayout()).toEqual(DEFAULT_PANEL_LAYOUT);
  });

  it('clampFraction keeps values within [MIN, MAX] and handles NaN', () => {
    expect(clampFraction(0.01)).toBe(MIN_PANEL_FRACTION);
    expect(clampFraction(0.99)).toBe(MAX_PANEL_FRACTION);
    expect(clampFraction(0.5)).toBe(0.5);
    expect(clampFraction(Number.NaN)).toBe(DEFAULT_PANEL_LAYOUT.sizeFraction);
  });
});
