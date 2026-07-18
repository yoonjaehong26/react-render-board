import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { CartEntry, PricingSummary } from '../pricing';
import { CartLineItem } from './CartLineItem';
import { CartSummary } from './CartSummary';
import { CheckoutErrorBoundary } from '../checkout/CheckoutErrorBoundary';
import { CheckoutPanel } from '../checkout/CheckoutPanel';

// 장바구니 드로어 — 두 번째 포탈(⧉). 담은 상품(CartLineItem 리스트) + pricing 요약(CartSummary,
// props 흐름 착지점) + 결제(CheckoutErrorBoundary>CheckoutPanel, 🛡)를 한 서브트리에 묶는다.
// pricing 객체는 여기서 소비만 하고 그대로 CartSummary/CheckoutPanel로 내려보내(drilling) props
// 흐름이 이 드로어를 관통하게 한다.
export function CartDrawer({
  entries,
  pricing,
  onQtyChange,
  onRemove,
  onClose,
}: {
  entries: CartEntry[];
  pricing: PricingSummary;
  onQtyChange: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onClose: () => void;
}) {
  const [failCheckout, setFailCheckout] = useState(false);

  return createPortal(
    <div className="cart-drawer-v2-overlay" onClick={onClose}>
      <aside className="cart-drawer-v2" onClick={(e) => e.stopPropagation()} aria-label="장바구니">
        <header className="cart-drawer-v2__head">
          <h3>장바구니 ({pricing.itemCount})</h3>
          <button type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        {entries.length === 0 ? (
          <p className="cart-drawer-v2__empty">담은 상품이 없습니다.</p>
        ) : (
          <>
            <ul className="cart-drawer-v2__list">
              {entries.map((entry) => (
                <CartLineItem
                  key={entry.product.id}
                  entry={entry}
                  onQtyChange={(qty) => onQtyChange(entry.product.id, qty)}
                  onRemove={() => onRemove(entry.product.id)}
                />
              ))}
            </ul>
            <CartSummary pricing={pricing} />
            <CheckoutErrorBoundary onReset={() => setFailCheckout(false)}>
              <CheckoutPanel
                pricing={pricing}
                shouldFail={failCheckout}
                onCheckout={onClose}
                onSimulateError={() => setFailCheckout(true)}
              />
            </CheckoutErrorBoundary>
          </>
        )}
      </aside>
    </div>,
    document.body,
  );
}
