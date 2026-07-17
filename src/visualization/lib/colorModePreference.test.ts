import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStoredColorMode, setStoredColorMode } from './colorModePreference';

beforeEach(() => {
  localStorage.clear();
});

describe('colorModePreference', () => {
  it('returns null when nothing is stored', () => {
    expect(getStoredColorMode()).toBeNull();
  });

  it('round-trips a stored value', () => {
    setStoredColorMode('dark');
    expect(getStoredColorMode()).toBe('dark');

    setStoredColorMode('light');
    expect(getStoredColorMode()).toBe('light');
  });

  it('returns null for an invalid stored value', () => {
    localStorage.setItem('rrb:colorMode', 'purple');
    expect(getStoredColorMode()).toBeNull();
  });

  it('does not throw and returns null when localStorage access throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getStoredColorMode()).toBeNull();
    spy.mockRestore();
  });

  it('does not throw when setStoredColorMode cannot write to storage', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setStoredColorMode('dark')).not.toThrow();
    spy.mockRestore();
  });
});
