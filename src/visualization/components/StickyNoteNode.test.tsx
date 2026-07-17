import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NodeProps } from '@xyflow/react';
import { StickyNoteNode, type StickyNoteNodeData } from './StickyNoteNode';

function renderStickyNote(overrides: Partial<StickyNoteNodeData> = {}) {
  const onTextChange = vi.fn();
  const onDelete = vi.fn();
  const data: StickyNoteNodeData = { text: '', onTextChange, onDelete, ...overrides };
  const props = {
    id: 'sticky-1',
    data,
    type: 'sticky',
    dragging: false,
    zIndex: 0,
    selectable: true,
    deletable: true,
    selected: false,
    draggable: true,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  } as NodeProps;
  const utils = render(<StickyNoteNode {...props} />);
  return { ...utils, onTextChange, onDelete };
}

describe('StickyNoteNode', () => {
  it('renders the current text in the textarea', () => {
    renderStickyNote({ text: 'hello world' });
    expect(screen.getByPlaceholderText('메모…')).toHaveValue('hello world');
  });

  it('calls onTextChange when the textarea is edited', () => {
    const { onTextChange } = renderStickyNote({ text: '' });
    fireEvent.change(screen.getByPlaceholderText('메모…'), { target: { value: 'x' } });
    expect(onTextChange).toHaveBeenCalledWith('x');
  });

  it('calls onDelete when the delete button is clicked', () => {
    const { onDelete } = renderStickyNote();
    fireEvent.click(screen.getByRole('button', { name: '메모 삭제' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('marks the textarea nodrag/nopan/nowheel so canvas gestures do not fire while editing', () => {
    renderStickyNote();
    const textarea = screen.getByPlaceholderText('메모…');
    expect(textarea).toHaveClass('nodrag', 'nopan', 'nowheel');
  });
});
