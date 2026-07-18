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
    highlighted: false,
    matched: false,
    isRouteEntry: false,
    colorMode: 'light',
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

  it('adds component-node--highlighted when highlighted is true (ADR-0024/0025 reverse navigation)', () => {
    const { container } = renderComponentNode(baseData({ highlighted: true }));
    expect(container.querySelector('.component-node')).toHaveClass('component-node--highlighted');
  });

  it('omits component-node--highlighted when highlighted is false', () => {
    const { container } = renderComponentNode(baseData({ highlighted: false }));
    expect(container.querySelector('.component-node')).not.toHaveClass('component-node--highlighted');
  });

  it('adds component-node--matched when matched is true (search highlight)', () => {
    const { container } = renderComponentNode(baseData({ matched: true }));
    expect(container.querySelector('.component-node')).toHaveClass('component-node--matched');
  });

  it('omits component-node--matched when matched is false', () => {
    const { container } = renderComponentNode(baseData({ matched: false }));
    expect(container.querySelector('.component-node')).not.toHaveClass('component-node--matched');
  });

  it('adds a component-node--palette-N class when colorIndex is set (domain palette)', () => {
    const { container } = renderComponentNode(baseData({ colorIndex: 3 }));
    expect(container.querySelector('.component-node')).toHaveClass('component-node--palette-3');
  });

  it('omits any palette class when colorIndex is undefined (e.g. pending group)', () => {
    const { container } = renderComponentNode(baseData());
    const el = container.querySelector('.component-node')!;
    expect([...el.classList].some((c) => c.startsWith('component-node--palette-'))).toBe(false);
  });

  it('renders only the base + kind classes when no boolean flags are set', () => {
    const { container } = renderComponentNode(baseData());
    const el = container.querySelector('.component-node')!;
    expect(el.className.split(' ')).toEqual(['component-node', 'component-node--composite']);
  });

  // --- 도형 어휘: 라우트 6각형 (ADR-0028) ---
  it('adds component-node--route when isRouteEntry is true', () => {
    const { container } = renderComponentNode(baseData({ isRouteEntry: true }));
    expect(container.querySelector('.component-node')).toHaveClass('component-node--route');
  });

  it('omits component-node--route when isRouteEntry is false', () => {
    const { container } = renderComponentNode(baseData({ isRouteEntry: false }));
    expect(container.querySelector('.component-node')).not.toHaveClass('component-node--route');
  });

  // --- 손그림 테두리 선택 (ADR-0030) ---
  it('sets a rough border background-image inline', () => {
    const { container } = renderComponentNode(baseData());
    const el = container.querySelector('.component-node') as HTMLElement;
    expect(el.style.backgroundImage).toContain('data:image/svg+xml');
  });

  it('uses a different border image for a route hexagon than a plain composite', () => {
    const { container: plain } = renderComponentNode(baseData({ isRouteEntry: false }));
    const { container: route } = renderComponentNode(baseData({ isRouteEntry: true }));
    const plainBg = (plain.querySelector('.component-node') as HTMLElement).style.backgroundImage;
    const routeBg = (route.querySelector('.component-node') as HTMLElement).style.backgroundImage;
    expect(routeBg).not.toBe(plainBg);
  });

  it('uses a different border image in dark mode than light mode (ADR-0030 dark borders)', () => {
    const { container: light } = renderComponentNode(baseData({ colorMode: 'light' }));
    const { container: dark } = renderComponentNode(baseData({ colorMode: 'dark' }));
    const lightBg = (light.querySelector('.component-node') as HTMLElement).style.backgroundImage;
    const darkBg = (dark.querySelector('.component-node') as HTMLElement).style.backgroundImage;
    expect(darkBg).not.toBe(lightBg);
  });

  it('layers an emphasis fill under the border for matched nodes (two background layers)', () => {
    const { container } = renderComponentNode(baseData({ matched: true }));
    const bg = (container.querySelector('.component-node') as HTMLElement).style.backgroundImage;
    // border + fill → two comma-separated url() layers.
    expect(bg.match(/url\(/g)?.length).toBe(2);
  });

  it('does not layer an emphasis fill for a plain node (single background layer)', () => {
    const { container } = renderComponentNode(baseData());
    const bg = (container.querySelector('.component-node') as HTMLElement).style.backgroundImage;
    expect(bg.match(/url\(/g)?.length).toBe(1);
  });

});
