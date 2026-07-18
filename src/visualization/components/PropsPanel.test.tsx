import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PropsPanel } from './PropsPanel';
import type { PropRow } from '../lib/propsFlow';

function row(overrides: Partial<PropRow> & { key: string }): PropRow {
  return { preview: 'x', kind: 'primitive', trackable: false, changed: false, ...overrides };
}

describe('PropsPanel', () => {
  it('renders the display name and rows with previews', () => {
    render(
      <PropsPanel
        displayName="Cart"
        rows={[row({ key: 'total', preview: '42' }), row({ key: 'items', preview: 'Array(3)', trackable: true })]}
        trackedKey={null}
        onTrackProp={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('Cart')).toBeInTheDocument();
    expect(screen.getByText('total')).toBeInTheDocument();
    expect(screen.getByText('Array(3)')).toBeInTheDocument();
  });

  it('shows a "변경됨" badge for changed props', () => {
    render(
      <PropsPanel
        displayName="X"
        rows={[row({ key: 'a', changed: true })]}
        trackedKey={null}
        onTrackProp={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('변경됨')).toBeInTheDocument();
  });

  it('disables non-trackable rows and calls onTrackProp only for trackable ones', () => {
    const onTrackProp = vi.fn();
    render(
      <PropsPanel
        displayName="X"
        rows={[
          row({ key: 'prim', trackable: false }),
          row({ key: 'obj', trackable: true, kind: 'object', preview: '{ a }' }),
        ]}
        trackedKey={null}
        onTrackProp={onTrackProp}
        onClose={() => {}}
      />,
    );

    // 비추적 행은 disabled라 네이티브 click이 핸들러를 부르지 않는다.
    screen.getByText('prim').closest('button')!.click();
    expect(onTrackProp).not.toHaveBeenCalled();

    screen.getByText('obj').closest('button')!.click();
    expect(onTrackProp).toHaveBeenCalledTimes(1);
    expect(onTrackProp.mock.calls[0][0]).toMatchObject({ key: 'obj' });
  });

  it('marks the tracked row and shows the footer', () => {
    render(
      <PropsPanel
        displayName="X"
        rows={[row({ key: 'obj', trackable: true })]}
        trackedKey="obj"
        onTrackProp={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('추적 중')).toBeInTheDocument();
    expect(screen.getByText(/같은 참조를 강조 중/)).toBeInTheDocument();
  });

  it('renders an empty state and a working close button', () => {
    const onClose = vi.fn();
    render(
      <PropsPanel displayName="X" rows={[]} trackedKey={null} onTrackProp={() => {}} onClose={onClose} />,
    );
    expect(screen.getByText('표시할 props가 없습니다')).toBeInTheDocument();

    screen.getByLabelText('props 패널 닫기').click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
