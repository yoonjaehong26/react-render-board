import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TargetBillboard } from './TargetBillboard';

const target = {
  componentPath: ['OrderSummary', 'CheckoutButton'],
  tagName: 'button',
  role: 'button',
  name: '결제하기',
};

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
});

describe('TargetBillboard', () => {
  it('shows a concise Fiber path and element description for a pinned selection', () => {
    render(<TargetBillboard target={target} preview={false} />);

    expect(screen.getByText('OrderSummary › CheckoutButton › button "결제하기"')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI용 복사' })).toBeInTheDocument();
  });

  it('keeps hover as a preview rather than offering an accidental clipboard action', () => {
    render(<TargetBillboard target={target} preview />);

    expect(screen.getByText('요소 미리보기')).toBeInTheDocument();
    expect(screen.getByText('클릭해 고정')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'AI용 복사' })).toBeNull();
  });

  it('explains when a repeated item needs a scoped ordinal to distinguish it', () => {
    render(
      <TargetBillboard
        target={{ ...target, instance: { componentName: 'ProductCard', label: '상품 준비 중', position: 2, total: 9 } }}
        preview={false}
      />,
    );

    expect(screen.getByText('식별 보조')).toBeInTheDocument();
    expect(screen.getByText('같은 "상품 준비 중" 항목이 9개라 2/9 순번을 함께 사용합니다.')).toBeInTheDocument();
  });

  it('warns plainly when an unnamed div has no semantic identification', () => {
    render(<TargetBillboard target={{ componentPath: [], tagName: 'div', role: null, name: null }} preview={false} />);

    expect(screen.getByText('식별 불충분')).toBeInTheDocument();
    expect(screen.getByText('요소의 역할과 이름을 찾지 못했습니다.')).toBeInTheDocument();
  });

  it('copies the compact target card and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<TargetBillboard target={target} preview={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'AI용 복사' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Target: OrderSummary › CheckoutButton › button "결제하기"'));
    expect(screen.getByRole('button', { name: '복사됨' })).toBeInTheDocument();
  });

  it('clears a pinned selection when its close button is pressed', () => {
    const onClear = vi.fn();
    render(<TargetBillboard target={target} preview={false} onClear={onClear} />);

    fireEvent.click(screen.getByRole('button', { name: '선택한 요소 닫기' }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
