import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RenderStore } from '../data/store';

vi.mock('bippy', () => ({ instrument: vi.fn() }));

import { instrument } from 'bippy';
import { startFiberInspector } from './fiberInspector';

const mockedInstrument = vi.mocked(instrument);

// The mocked `instrument` erases bippy's real InstrumentationOptions/FiberRoot types, so the
// captured options/callback are read back through this narrow shape instead of fighting bippy's
// actual (unrelated at runtime) type definitions.
interface CapturedOptions {
  name: string;
  onCommitFiberRoot: (rendererID: number, root: unknown) => void;
}

function fakeStore(): RenderStore {
  return {
    subscribe: vi.fn(() => () => {}),
    getSnapshot: vi.fn(() => ({ commitId: 0, nodes: [] })),
    handleCommit: vi.fn(),
  };
}

beforeEach(() => {
  mockedInstrument.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('startFiberInspector', () => {
  it('calls instrument() with a name and an onCommitFiberRoot handler, and returns its unsubscribe function', () => {
    const unsub = vi.fn();
    mockedInstrument.mockReturnValue(unsub);
    const store = fakeStore();
    const subjectContainer = document.createElement('div');

    const result = startFiberInspector(store, subjectContainer);

    expect(mockedInstrument).toHaveBeenCalledTimes(1);
    const options = mockedInstrument.mock.calls[0][0] as unknown as CapturedOptions;
    expect(options.name).toBe('react-render-board');
    expect(typeof options.onCommitFiberRoot).toBe('function');
    expect(result).toBe(unsub);
  });

  it('calls store.handleCommit(root.current) when containerInfo matches the subject container', () => {
    mockedInstrument.mockReturnValue(vi.fn());
    const store = fakeStore();
    const subjectContainer = document.createElement('div');
    startFiberInspector(store, subjectContainer);

    const options = mockedInstrument.mock.calls[0][0] as unknown as CapturedOptions;
    const fakeCurrent = { tag: 3 };
    options.onCommitFiberRoot(1, { containerInfo: subjectContainer, current: fakeCurrent });

    expect(store.handleCommit).toHaveBeenCalledWith(fakeCurrent);
  });

  it('does not call store.handleCommit when containerInfo does not match (e.g. the board is a different React root on the page)', () => {
    mockedInstrument.mockReturnValue(vi.fn());
    const store = fakeStore();
    const subjectContainer = document.createElement('div');
    const boardContainer = document.createElement('div');
    startFiberInspector(store, subjectContainer);

    const options = mockedInstrument.mock.calls[0][0] as unknown as CapturedOptions;
    options.onCommitFiberRoot(1, { containerInfo: boardContainer, current: { tag: 3 } });

    expect(store.handleCommit).not.toHaveBeenCalled();
  });

  it('catches an error thrown by store.handleCommit and logs it instead of letting it propagate', () => {
    mockedInstrument.mockReturnValue(vi.fn());
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = fakeStore();
    vi.mocked(store.handleCommit).mockImplementation(() => {
      throw new Error('boom');
    });
    const subjectContainer = document.createElement('div');
    startFiberInspector(store, subjectContainer);

    const options = mockedInstrument.mock.calls[0][0] as unknown as CapturedOptions;
    expect(() => {
      options.onCommitFiberRoot(1, { containerInfo: subjectContainer, current: { tag: 3 } });
    }).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('does not call instrument() and returns a no-op unsubscribe when import.meta.env.DEV is false', () => {
    vi.stubEnv('DEV', false);
    const store = fakeStore();
    const subjectContainer = document.createElement('div');

    const result = startFiberInspector(store, subjectContainer);

    expect(mockedInstrument).not.toHaveBeenCalled();
    expect(() => result()).not.toThrow();
  });
});
