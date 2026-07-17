import { describe, it, expect } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ReactFlowProvider, useStoreApi, type NodeProps } from '@xyflow/react';
import { GroupNode } from './GroupNode';
import type { GroupNodeData } from '../lib/toFlow';

function baseData(overrides: Partial<GroupNodeData> = {}): GroupNodeData {
  return {
    label: 'domains/shell',
    count: 3,
    pending: false,
    collapsed: false,
    ...overrides,
  };
}

function nodeProps(data: GroupNodeData): NodeProps {
  return {
    id: 'group:domains/shell',
    data,
    type: 'group',
    dragging: false,
    zIndex: -1,
    selectable: false,
    deletable: true,
    selected: false,
    draggable: false,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  };
}

// useViewport() (used internally by GroupNode for the counter-scale) needs
// ReactFlowProvider's zustand context.
function renderGroupNode(data: GroupNodeData) {
  return render(
    <ReactFlowProvider>
      <GroupNode {...nodeProps(data)} />
    </ReactFlowProvider>,
  );
}

// useReactFlow().setViewport() is a no-op in this setup: it delegates to the
// `panZoom` (d3-zoom) instance, which is only created when the real <ReactFlow>
// pane mounts (ResizeObserver etc., unavailable/unset up in jsdom here) — see
// @xyflow/react's useViewportHelper, `if (!panZoom) return false`. Writing
// `transform` directly via the lower-level store API is the same mechanism
// @xyflow/react itself uses to sync a controlled `viewport` prop, and it drives
// useViewport()/useStore() without needing panZoom.
function ZoomSetter({ zoom }: { zoom: number }) {
  const store = useStoreApi();
  useEffect(() => {
    store.setState({ transform: [0, 0, zoom] });
  }, [zoom, store]);
  return null;
}

function renderGroupNodeAtZoom(zoom: number, data: GroupNodeData) {
  return render(
    <ReactFlowProvider>
      <ZoomSetter zoom={zoom} />
      <GroupNode {...nodeProps(data)} />
    </ReactFlowProvider>,
  );
}

describe('GroupNode', () => {
  it('renders the label and count', () => {
    renderGroupNode(baseData({ label: 'domains/checkout', count: 12 }));
    expect(screen.getByText('domains/checkout')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('adds group-node--pending when pending is true', () => {
    const { container } = renderGroupNode(baseData({ pending: true }));
    expect(container.querySelector('.group-node')).toHaveClass('group-node--pending');
  });

  it('omits group-node--pending when pending is false', () => {
    const { container } = renderGroupNode(baseData({ pending: false }));
    expect(container.querySelector('.group-node')).not.toHaveClass('group-node--pending');
  });

  it('adds group-node--collapsed when collapsed is true', () => {
    const { container } = renderGroupNode(baseData({ collapsed: true }));
    expect(container.querySelector('.group-node')).toHaveClass('group-node--collapsed');
  });

  it('omits group-node--collapsed when collapsed is false', () => {
    const { container } = renderGroupNode(baseData({ collapsed: false }));
    expect(container.querySelector('.group-node')).not.toHaveClass('group-node--collapsed');
  });

  it('adds a group-node--palette-N class when colorIndex is set (domain palette)', () => {
    const { container } = renderGroupNode(baseData({ colorIndex: 5 }));
    expect(container.querySelector('.group-node')).toHaveClass('group-node--palette-5');
  });

  it('omits any palette class when colorIndex is undefined (e.g. pending group)', () => {
    const { container } = renderGroupNode(baseData());
    const el = container.querySelector('.group-node')!;
    expect([...el.classList].some((c) => c.startsWith('group-node--palette-'))).toBe(false);
  });

  it('renders the label at scale(1) at the default zoom (1)', () => {
    const { container } = renderGroupNode(baseData());
    const label = container.querySelector('.group-node__label') as HTMLElement;
    expect(label.style.transform).toBe('scale(1)');
  });

  it('counter-scales the label as 1/zoom at a non-default zoom', async () => {
    const { container } = renderGroupNodeAtZoom(0.5, baseData());
    await waitFor(() => {
      const label = container.querySelector('.group-node__label') as HTMLElement;
      expect(label.style.transform).toBe('scale(2)');
    });
    const count = container.querySelector('.group-node__count') as HTMLElement;
    expect(count.style.transform).toBe('scale(2)');
  });
});
