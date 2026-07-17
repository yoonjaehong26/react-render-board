import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContextMenu } from './ContextMenu';

describe('ContextMenu', () => {
  it('renders nothing when state is null', () => {
    const { container } = render(<ContextMenu state={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one item per action, at the given screen position', () => {
    render(
      <ContextMenu
        state={{ x: 42, y: 99, actions: [{ label: '이 그룹으로 확대', onSelect: () => {} }] }}
        onClose={() => {}}
      />,
    );
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe('42px');
    expect(menu.style.top).toBe('99px');
    expect(screen.getByRole('menuitem', { name: '이 그룹으로 확대' })).toBeInTheDocument();
  });

  it('calls the action onSelect and then onClose when an item is clicked', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu state={{ x: 0, y: 0, actions: [{ label: '펼치기', onSelect }] }} onClose={onClose} />,
    );
    screen.getByRole('menuitem', { name: '펼치기' }).click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders multiple actions in order', () => {
    render(
      <ContextMenu
        state={{
          x: 0,
          y: 0,
          actions: [
            { label: '실제 화면에서 보기', onSelect: () => {} },
            { label: '이 이름으로 검색', onSelect: () => {} },
          ],
        }}
        onClose={() => {}}
      />,
    );
    const items = screen.getAllByRole('menuitem');
    expect(items.map((el) => el.textContent)).toEqual(['실제 화면에서 보기', '이 이름으로 검색']);
  });
});
