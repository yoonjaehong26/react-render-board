export function CartLineItem({ name, price, onRemove }: { name: string; price: number; onRemove: () => void }) {
  return (
    <li className="cart-line-item">
      <span className="cart-line-item__name">{name}</span>
      <span className="cart-line-item__price">{price.toLocaleString()}원</span>
      <button
        type="button"
        className="cart-line-item__remove"
        onClick={onRemove}
        aria-label={`${name} 장바구니에서 제거`}
      >
        ×
      </button>
    </li>
  );
}
