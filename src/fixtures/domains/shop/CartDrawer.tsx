import { CartLineItem } from './CartLineItem';
import type { Product } from './data';

export function CartDrawer({ items, onRemove }: { items: Product[]; onRemove: (index: number) => void }) {
  const total = items.reduce((sum, p) => sum + p.price, 0);
  return (
    <aside className="cart-drawer">
      <h3>장바구니 ({items.length})</h3>
      <ul>
        {items.map((item, i) => (
          <CartLineItem key={`${item.id}-${i}`} name={item.name} price={item.price} onRemove={() => onRemove(i)} />
        ))}
      </ul>
      <div className="cart-drawer__total">합계 {total.toLocaleString()}원</div>
    </aside>
  );
}
