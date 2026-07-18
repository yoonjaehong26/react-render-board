import { describe, it, expect } from 'vitest';
import {
  nodeBorderImage,
  groupFrameImage,
  CHROME_BORDER,
  ROUGH_FILL_MATCHED,
  ROUGH_FILL_HIGHLIGHTED,
  ROUGH_BORDER_COMPOSITE,
  ROUGH_BORDER_HOST,
} from './roughStyle';

function isSvgDataUrl(v: string): boolean {
  return v.startsWith('url("data:image/svg+xml,') && v.endsWith('")');
}

describe('roughStyle', () => {
  it('produces valid SVG data-URI borders for every (mode, kind, route) combo', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const kind of ['composite', 'host'] as const) {
        expect(isSvgDataUrl(nodeBorderImage(kind, mode, false))).toBe(true);
      }
      expect(isSvgDataUrl(nodeBorderImage('composite', mode, true))).toBe(true);
    }
  });

  it('route entry (hexagon) differs from a plain composite rectangle in the same mode', () => {
    expect(nodeBorderImage('composite', 'light', true)).not.toBe(nodeBorderImage('composite', 'light', false));
  });

  it('route shape wins over kind — a host node that is a route still gets the hexagon', () => {
    expect(nodeBorderImage('host', 'light', true)).toBe(nodeBorderImage('composite', 'light', true));
  });

  it('dark borders differ from light borders (ADR-0030 dark identity, #818cf8)', () => {
    expect(nodeBorderImage('composite', 'dark', false)).not.toBe(nodeBorderImage('composite', 'light', false));
    expect(nodeBorderImage('host', 'dark', false)).not.toBe(nodeBorderImage('host', 'light', false));
  });

  it('host and composite borders differ (dashed vs solid, distinct stroke)', () => {
    expect(nodeBorderImage('host', 'light', false)).not.toBe(nodeBorderImage('composite', 'light', false));
  });

  it('returns a stable reference across calls (static O(1) shared image, not recomputed per node)', () => {
    expect(nodeBorderImage('composite', 'light', false)).toBe(nodeBorderImage('composite', 'light', false));
  });

  it('exposes matched (hachure) and highlighted (marker) emphasis fills as data URIs, and they differ', () => {
    expect(isSvgDataUrl(ROUGH_FILL_MATCHED)).toBe(true);
    expect(isSvgDataUrl(ROUGH_FILL_HIGHLIGHTED)).toBe(true);
    expect(ROUGH_FILL_MATCHED).not.toBe(ROUGH_FILL_HIGHLIGHTED);
  });

  it('exposes light/dark volpen chrome borders as data URIs, and they differ', () => {
    expect(isSvgDataUrl(CHROME_BORDER.light)).toBe(true);
    expect(isSvgDataUrl(CHROME_BORDER.dark)).toBe(true);
    expect(CHROME_BORDER.light).not.toBe(CHROME_BORDER.dark);
  });

  it('keeps the legacy exports pointing at the light rectangle borders (back-compat)', () => {
    expect(ROUGH_BORDER_COMPOSITE).toBe(nodeBorderImage('composite', 'light', false));
    expect(ROUGH_BORDER_HOST).toBe(nodeBorderImage('host', 'light', false));
  });

  describe('groupFrameImage (그룹 프레임 손그림, ADR-0030 축3)', () => {
    it('produces a valid SVG data URI sized to the group frame', () => {
      expect(isSvgDataUrl(groupFrameImage(400, 200, '#6366f1'))).toBe(true);
    });

    it('memoizes by rounded size + stroke — same bucket returns the identical cached string', () => {
      const a = groupFrameImage(400, 200, '#6366f1');
      const b = groupFrameImage(401, 201, '#6366f1'); // rounds to the same 4px bucket (400×200) → same cache key
      expect(b).toBe(a);
    });

    it('recomputes for a different stroke color (light vs dark palette)', () => {
      expect(groupFrameImage(400, 200, '#6366f1')).not.toBe(groupFrameImage(400, 200, '#818cf8'));
    });

    it('recomputes for a meaningfully different size', () => {
      expect(groupFrameImage(400, 200, '#6366f1')).not.toBe(groupFrameImage(800, 200, '#6366f1'));
    });
  });
});
