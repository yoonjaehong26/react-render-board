import { describe, it, expect } from 'vitest';
import { useEffect, useRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ReactFlowProvider, useStoreApi } from '@xyflow/react';
import { SemanticZoomController, MAP_MODE_THRESHOLD } from './SemanticZoomController';

// Same technique as GroupNode.test.tsx: useReactFlow().setViewport() no-ops without
// a mounted <ReactFlow> pane (no panZoom instance in jsdom), so we write `transform`
// directly through the lower-level store API instead.
function ZoomSetter({ zoom }: { zoom: number }) {
  const store = useStoreApi();
  useEffect(() => {
    store.setState({ transform: [0, 0, zoom] });
  }, [zoom, store]);
  return null;
}

function Harness({ zoom }: { zoom?: number }) {
  const targetRef = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div ref={targetRef} data-testid="target" />
      {zoom !== undefined && <ZoomSetter zoom={zoom} />}
      <SemanticZoomController targetRef={targetRef} />
    </div>
  );
}

function renderController(zoom?: number) {
  return render(
    <ReactFlowProvider>
      <Harness zoom={zoom} />
    </ReactFlowProvider>,
  );
}

describe('SemanticZoomController', () => {
  it('applies zoom-near (not zoom-far) at the default zoom (1, >= threshold) and shows detail-mode text', async () => {
    renderController();
    const target = screen.getByTestId('target');

    // The class toggle happens in a useEffect keyed off the store-derived zoom.
    await waitFor(() => expect(target).toHaveClass('zoom-near'));
    expect(target).not.toHaveClass('zoom-far');

    expect(screen.getByText(/상세 모드/)).toBeInTheDocument();
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });

  it('applies zoom-far (not zoom-near) below MAP_MODE_THRESHOLD and shows map-mode text', async () => {
    const belowThreshold = MAP_MODE_THRESHOLD - 0.1;
    renderController(belowThreshold);
    const target = screen.getByTestId('target');

    await waitFor(() => expect(target).toHaveClass('zoom-far'));
    expect(target).not.toHaveClass('zoom-near');

    expect(screen.getByText(/지도 모드/)).toBeInTheDocument();
    expect(screen.getByText(`${Math.round(belowThreshold * 100)}%`, { exact: false })).toBeInTheDocument();
  });
});
