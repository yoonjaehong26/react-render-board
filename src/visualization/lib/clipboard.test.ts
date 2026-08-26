import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './clipboard';

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  Reflect.deleteProperty(document, 'execCommand');
});

describe('copyTextToClipboard', () => {
  it('uses the modern asynchronous clipboard API when it is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    await copyTextToClipboard('Target: CheckoutButton');

    expect(writeText).toHaveBeenCalledWith('Target: CheckoutButton');
  });

  it('falls back to a temporary textarea when navigator.clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const copy = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: copy });

    await copyTextToClipboard('Target: PriceSummary');

    expect(copy).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });
});
