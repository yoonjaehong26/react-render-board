import { describe, it, expect } from 'vitest';
import { worldRectFromViewport, expandRect, rectsIntersect } from './geometry';
import type { Rect } from './layout';

describe('worldRectFromViewport', () => {
  it('returns the screen rect unchanged at identity viewport (x:0, y:0, zoom:1)', () => {
    const result = worldRectFromViewport({ x: 0, y: 0, zoom: 1 }, 800, 600);
    // -viewport.x/zoom on x:0 is IEEE754 negative zero, and toEqual (like toBe)
    // distinguishes it from +0 via Object.is — numerically still 0 (0 === -0).
    expect(result).toEqual({ x: -0, y: -0, width: 800, height: 600 });
    expect(result.x === 0).toBe(true);
    expect(result.y === 0).toBe(true);
  });

  it('applies the inverse pan/zoom transform for a panned+zoomed viewport', () => {
    // x = -viewport.x / zoom, y = -viewport.y / zoom, width/height = screen size / zoom.
    const result = worldRectFromViewport({ x: -100, y: -50, zoom: 2 }, 800, 600);
    expect(result).toEqual({ x: 50, y: 25, width: 400, height: 300 });
  });
});

describe('expandRect', () => {
  it('grows width/height by 2x marginRatio while keeping the same center', () => {
    const rect: Rect = { x: 0, y: 0, width: 100, height: 200 };
    const expanded = expandRect(rect, 0.5);

    expect(expanded).toEqual({ x: -50, y: -100, width: 200, height: 400 });

    const originalCenter = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const expandedCenter = { x: expanded.x + expanded.width / 2, y: expanded.y + expanded.height / 2 };
    expect(expandedCenter).toEqual(originalCenter);
  });

  it('is a no-op at marginRatio 0', () => {
    const rect: Rect = { x: 10, y: 20, width: 30, height: 40 };
    expect(expandRect(rect, 0)).toEqual(rect);
  });
});

describe('rectsIntersect', () => {
  it('returns true for overlapping rects', () => {
    const a: Rect = { x: 0, y: 0, width: 100, height: 100 };
    const b: Rect = { x: 50, y: 50, width: 100, height: 100 };
    expect(rectsIntersect(a, b)).toBe(true);
  });

  it('returns false for rects that only touch along an edge (strict inequality, not <=)', () => {
    const a: Rect = { x: 0, y: 0, width: 100, height: 100 };
    const b: Rect = { x: 100, y: 0, width: 100, height: 100 }; // a.x + a.width === b.x
    expect(rectsIntersect(a, b)).toBe(false);
  });

  it('returns false for clearly disjoint rects', () => {
    const a: Rect = { x: 0, y: 0, width: 100, height: 100 };
    const b: Rect = { x: 500, y: 500, width: 100, height: 100 };
    expect(rectsIntersect(a, b)).toBe(false);
  });

  it('returns true when one rect fully contains the other', () => {
    const outer: Rect = { x: 0, y: 0, width: 500, height: 500 };
    const inner: Rect = { x: 100, y: 100, width: 50, height: 50 };
    expect(rectsIntersect(outer, inner)).toBe(true);
    expect(rectsIntersect(inner, outer)).toBe(true);
  });
});
