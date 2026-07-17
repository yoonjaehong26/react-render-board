import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { ComponentNode } from './ComponentNode';
import type { ComponentNodeData } from '../lib/toFlow';

function baseData(overrides: Partial<ComponentNodeData> = {}): ComponentNodeData {
  return {
    displayName: 'MyComponent',
    kind: 'composite',
    isAnonymous: false,
    crossGroup: false,
    pending: false,
    ...overrides,
  };
}

// Handle (from @xyflow/react) reads connection/edge state from React Flow's zustand
// context, so it throws outside of a ReactFlowProvider — wrap every render in one.
function renderComponentNode(data: ComponentNodeData) {
  const props: NodeProps = {
    id: 'n1',
    data,
    type: 'component',
    dragging: false,
    zIndex: 0,
    selectable: true,
    deletable: true,
    selected: false,
    draggable: true,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  };
  return render(
    <ReactFlowProvider>
      <ComponentNode {...props} />
    </ReactFlowProvider>,
  );
}

describe('ComponentNode', () => {
  it('renders the displayName text', () => {
    renderComponentNode(baseData({ displayName: 'Toolbar' }));
    expect(screen.getByText('Toolbar')).toBeInTheDocument();
  });

  it('applies the host kind class for host components', () => {
    const { container } = renderComponentNode(baseData({ kind: 'host' }));
    const el = container.querySelector('.component-node')!;
    expect(el).toHaveClass('component-node', 'component-node--host');
    expect(el).not.toHaveClass('component-node--composite');
  });

  it('applies the composite kind class for composite components', () => {
    const { container } = renderComponentNode(baseData({ kind: 'composite' }));
    const el = container.querySelector('.component-node')!;
    expect(el).toHaveClass('component-node', 'component-node--composite');
    expect(el).not.toHaveClass('component-node--host');
  });

  it('adds component-node--anonymous when isAnonymous is true', () => {
    const { container } = renderComponentNode(baseData({ isAnonymous: true }));
    expect(container.querySelector('.component-node')).toHaveClass('component-node--anonymous');
  });

  it('omits component-node--anonymous when isAnonymous is false', () => {
    const { container } = renderComponentNode(baseData({ isAnonymous: false }));
    expect(container.querySelector('.component-node')).not.toHaveClass('component-node--anonymous');
  });

  it('adds component-node--cross-group when crossGroup is true', () => {
    const { container } = renderComponentNode(baseData({ crossGroup: true }));
    expect(container.querySelector('.component-node')).toHaveClass('component-node--cross-group');
  });

  it('omits component-node--cross-group when crossGroup is false', () => {
    const { container } = renderComponentNode(baseData({ crossGroup: false }));
    expect(container.querySelector('.component-node')).not.toHaveClass('component-node--cross-group');
  });

  it('adds component-node--pending when pending is true', () => {
    const { container } = renderComponentNode(baseData({ pending: true }));
    expect(container.querySelector('.component-node')).toHaveClass('component-node--pending');
  });

  it('omits component-node--pending when pending is false', () => {
    const { container } = renderComponentNode(baseData({ pending: false }));
    expect(container.querySelector('.component-node')).not.toHaveClass('component-node--pending');
  });

  it('renders only the base + kind classes when no boolean flags are set', () => {
    const { container } = renderComponentNode(baseData());
    const el = container.querySelector('.component-node')!;
    expect(el.className.split(' ')).toEqual(['component-node', 'component-node--composite']);
  });
});
