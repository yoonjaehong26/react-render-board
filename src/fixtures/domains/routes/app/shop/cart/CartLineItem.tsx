import type { CartEntry } from '../pricing';
import { finalPrice } from '../enrich';
import { QuantityStepper } from './QuantityStepper';

// 장바구니 한 줄 — 담은 상품 수만큼 렌더돼(같은 종류 형제) 여러 개 담으면 여기서도 리스트 접기가
// 걸린다. 수량 스테퍼로 qty를 바꾸면 상위 pricing 객체가 새로 만들어져 props 흐름이 발동한다.
export function CartLineItem({
  entry,
  onQtyChange,
  onRemove,
}: {
  entry: CartEntry;
  onQtyChange: (qty: number) => void;
  onRemove: () => void;
}) {
  return (
    <li className="cart-line-v2">
      <span className="cart-line-v2__name">{entry.product.name}</span>
      <QuantityStepper qty={entry.qty} onChange={onQtyChange} />
      <span className="cart-line-v2__price">{(finalPrice(entry.product) * entry.qty).toLocaleString()}원</span>
      <button type="button" className="cart-line-v2__remove" onClick={onRemove} aria-label={`${entry.product.name} 제거`}>
        ×
      </button>
    </li>
  );
}
