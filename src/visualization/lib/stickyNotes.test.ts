import { describe, it, expect, vi } from 'vitest';
import { loadStickyNotes, saveStickyNotes, createStickyNoteId } from './stickyNotes';

describe('loadStickyNotes / saveStickyNotes', () => {
  it('returns an empty array when nothing is stored', () => {
    localStorage.clear();
    expect(loadStickyNotes()).toEqual([]);
  });

  it('round-trips a list of notes', () => {
    const notes = [
      { id: 'a', x: 10, y: 20, text: 'hello' },
      { id: 'b', x: -5, y: 0, text: '' },
    ];
    saveStickyNotes(notes);
    expect(loadStickyNotes()).toEqual(notes);
  });

  it('returns an empty array for malformed stored JSON', () => {
    localStorage.setItem('rrb:stickyNotes', '{not valid json');
    expect(loadStickyNotes()).toEqual([]);
  });

  it('returns an empty array when the stored value is not an array', () => {
    localStorage.setItem('rrb:stickyNotes', JSON.stringify({ not: 'an array' }));
    expect(loadStickyNotes()).toEqual([]);
  });

  it('filters out malformed entries while keeping valid ones', () => {
    localStorage.setItem(
      'rrb:stickyNotes',
      JSON.stringify([{ id: 'a', x: 1, y: 2, text: 'ok' }, { id: 'b', x: 'not-a-number', y: 2, text: 'bad' }, null]),
    );
    expect(loadStickyNotes()).toEqual([{ id: 'a', x: 1, y: 2, text: 'ok' }]);
  });

  it('does not throw when localStorage access throws', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadStickyNotes()).toEqual([]);
    getSpy.mockRestore();

    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveStickyNotes([{ id: 'a', x: 0, y: 0, text: '' }])).not.toThrow();
    setSpy.mockRestore();
  });
});

describe('createStickyNoteId', () => {
  it('generates unique ids across calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createStickyNoteId()));
    expect(ids.size).toBe(20);
  });

  it('generates ids matching the expected sticky- prefix format', () => {
    expect(createStickyNoteId()).toMatch(/^sticky-\d+-[a-z0-9]+$/);
  });
});
