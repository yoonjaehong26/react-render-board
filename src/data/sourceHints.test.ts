import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Fiber } from 'bippy';

vi.mock('bippy/source', () => ({ getSource: vi.fn() }));

import { getSource } from 'bippy/source';
import { resolveGroupHints, usagePathFromStack } from './sourceHints';

const mockedGetSource = vi.mocked(getSource);

function fakeFiber(): Fiber {
  return {} as Fiber;
}

describe('usagePathFromStack', () => {
  it('extracts the first app-source URL pathname from an owner stack', () => {
    const err = new Error('react-stack-top-frame');
    err.stack = [
      'Error: react-stack-top-frame',
      '    at exports.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=57a9e4ac:193:83)',
      '    at DemoApp (http://localhost:5173/src/fixtures/DemoApp.tsx:106:20)',
    ].join('\n');
    expect(usagePathFromStack(err)).toBe('/src/fixtures/DemoApp.tsx');
  });

  it('skips node_modules frames', () => {
    const stack = [
      '    at Wrapped (http://localhost:5173/node_modules/.vite/deps/some-lib.js:1:1)',
      '    at Panel (http://localhost:5173/src/domains/dataflow/DataFlowPanel.tsx:12:3)',
    ].join('\n');
    expect(usagePathFromStack(stack)).toBe('/src/domains/dataflow/DataFlowPanel.tsx');
  });

  it('strips query strings and line:col', () => {
    const stack = '    at X (http://localhost:5173/src/a/B.tsx?t=123:9:4)';
    expect(usagePathFromStack(stack)).toBe('/src/a/B.tsx');
  });

  it('returns null when there is no usable stack or source frame', () => {
    expect(usagePathFromStack(null)).toBeNull();
    expect(usagePathFromStack(undefined)).toBeNull();
    expect(usagePathFromStack(new Error('no frames'))).toBeNull();
    expect(usagePathFromStack('    at Foo (http://localhost:5173/node_modules/x.js:1:1)')).toBeNull();
  });
});

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
        { id: 1, groupHint: 'src/App.tsx', groupPath: null },
        { id: 2, groupHint: 'src/Button.tsx', groupPath: null },
      ]),
    );
    expect(results).toHaveLength(2);
  });

  it('returns groupHint: null when getSource resolves to null', async () => {
    mockedGetSource.mockResolvedValue(null);

    const results = await resolveGroupHints(new Map([[1, fakeFiber()]]));

    expect(results).toEqual([{ id: 1, groupHint: null, groupPath: null }]);
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
        { id: 1, groupHint: 'ok.tsx', groupPath: null },
        { id: 2, groupHint: null, groupPath: null },
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
