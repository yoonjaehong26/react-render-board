import { describe, expect, it } from 'vitest';
import { leastObstructiveDock, panelRect, shouldUseFocusRail } from './panelPlacement';

const viewport = { width: 1000, height: 800 };

describe('panel placement', () => {
  it('opens opposite a left-side target', () => {
    expect(leastObstructiveDock({ left: 20, top: 220, width: 180, height: 160 }, 'left', 0.35, viewport).dock).toBe('right');
  });

  it('can use the top dock for a lower target', () => {
    expect(leastObstructiveDock({ left: 0, top: 660, width: 1000, height: 100 }, 'bottom', 0.3, viewport).dock).toBe('top');
  });

  it('uses current dock to break an equal-overlap tie', () => {
    expect(leastObstructiveDock({ left: 400, top: 300, width: 100, height: 100 }, 'right', 0.3, viewport).dock).toBe('right');
  });

  it('recognizes a large full-screen target as rail-worthy', () => {
    const target = { left: 0, top: 0, width: 1000, height: 800 };
    const { overlapRatio } = leastObstructiveDock(target, 'left', 0.35, viewport);
    expect(shouldUseFocusRail(target, overlapRatio, viewport)).toBe(true);
  });

  it('describes top panel geometry', () => {
    expect(panelRect('top', 0.25, viewport)).toEqual({ left: 0, top: 0, width: 1000, height: 200 });
  });
});
