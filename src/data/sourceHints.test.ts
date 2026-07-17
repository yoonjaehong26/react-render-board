import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Fiber } from 'bippy';

vi.mock('bippy/source', () => ({ getSource: vi.fn() }));

import { getSource } from 'bippy/source';
import { resolveGroupHints } from './sourceHints';

const mockedGetSource = vi.mocked(getSource);

function fakeFiber(): Fiber {
  return {} as Fiber;
}

describe('resolveGroupHints', () => {
  beforeEach(() => {
    mockedGetSource.mockReset();
  });

  it('resolves groupHint to source.fileName for each id', async () => {
    const appFiber = fakeFiber();
    const buttonFiber = fakeFiber();
    mockedGetSource.mockImplementation(async (fiber) => {
      if (fiber === appFiber) return { fileName: 'src/App.tsx' };
      if (fiber === buttonFiber) return { fileName: 'src/Button.tsx' };
      throw new Error('unexpected fiber');
    });

    const results = await resolveGroupHints(
      new Map([
        [1, appFiber],
        [2, buttonFiber],
      ]),
    );

    expect(results).toEqual(
      expect.arrayContaining([
        { id: 1, groupHint: 'src/App.tsx' },
        { id: 2, groupHint: 'src/Button.tsx' },
      ]),
    );
    expect(results).toHaveLength(2);
  });

  it('returns groupHint: null when getSource resolves to null', async () => {
    mockedGetSource.mockResolvedValue(null);

    const results = await resolveGroupHints(new Map([[1, fakeFiber()]]));

    expect(results).toEqual([{ id: 1, groupHint: null }]);
  });

  it('catches a per-entry rejection, logs it, and still resolves the other entries in the batch', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const okFiber = fakeFiber();
    const badFiber = fakeFiber();
    mockedGetSource.mockImplementation(async (fiber) => {
      if (fiber === badFiber) throw new Error('boom');
      return { fileName: 'ok.tsx' };
    });

    const results = await resolveGroupHints(
      new Map([
        [1, okFiber],
        [2, badFiber],
      ]),
    );

    expect(results).toEqual(
      expect.arrayContaining([
        { id: 1, groupHint: 'ok.tsx' },
        { id: 2, groupHint: null },
      ]),
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('returns an empty array for an empty map', async () => {
    const results = await resolveGroupHints(new Map());

    expect(results).toEqual([]);
    expect(mockedGetSource).not.toHaveBeenCalled();
  });
});
