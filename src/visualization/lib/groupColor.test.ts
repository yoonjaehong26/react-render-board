import { describe, it, expect } from 'vitest';
import { colorIndexForGroup, paletteHex, PALETTE_SIZE } from './groupColor';

describe('colorIndexForGroup', () => {
  it('is deterministic for the same group name', () => {
    expect(colorIndexForGroup('domains/checkout/CheckoutPanel.tsx')).toBe(
      colorIndexForGroup('domains/checkout/CheckoutPanel.tsx'),
    );
  });

  it('always returns a valid palette index', () => {
    for (const group of ['a', 'domains/shell', 'domains/checkout', '', 'x'.repeat(50)]) {
      const index = colorIndexForGroup(group);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(PALETTE_SIZE);
    }
  });

  it('assigns at least two distinct colors across a handful of different group names', () => {
    const groups = ['domains/shell', 'domains/checkout', 'domains/reports', 'domains/livefeed', 'domains/advanced'];
    const indices = new Set(groups.map(colorIndexForGroup));
    expect(indices.size).toBeGreaterThan(1);
  });
});

describe('paletteHex', () => {
  it('returns a hex color string for any valid index', () => {
    for (let i = 0; i < PALETTE_SIZE; i++) {
      expect(paletteHex(i)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('returns a different color for dark mode than light mode at the same index', () => {
    for (let i = 0; i < PALETTE_SIZE; i++) {
      expect(paletteHex(i, 'dark')).not.toBe(paletteHex(i, 'light'));
    }
  });

  it('defaults to light mode when colorMode is omitted', () => {
    expect(paletteHex(0)).toBe(paletteHex(0, 'light'));
  });

  it('wraps out-of-range indices back into the palette', () => {
    expect(paletteHex(PALETTE_SIZE)).toBe(paletteHex(0));
  });
});
