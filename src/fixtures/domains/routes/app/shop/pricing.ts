import type { EnrichedProduct } from './enrich';
import { finalPrice } from './enrich';

export interface CartEntry {
  product: EnrichedProduct;
  qty: number;
}

// 장바구니 상태에서 파생되는 "가격 요약" 객체. props 흐름 추적(ADR-0032) 시연의 핵심이다 —
// 장바구니가 바뀔 때마다 이 함수가 **새 객체**를 만들어(같은 참조 아님) ShopSitePage→CartDrawer→
// CartSummary로 drilling되므로, 보드에서 그 노드를 클릭하면 pricing 객체가 자손으로 흐르는 걸
// props 패널·참조 추적·변경 잔상으로 볼 수 있다.
export interface PricingSummary {
  itemCount: number;
  subtotal: number;
  shippingFee: number;
  discountTotal: number;
  grandTotal: number;
}

const FREE_SHIPPING_THRESHOLD = 50000;
const SHIPPING_FEE = 3000;

export function computePricing(entries: CartEntry[]): PricingSummary {
  let subtotal = 0;
  let discountTotal = 0;
  let itemCount = 0;
  for (const { product, qty } of entries) {
    itemCount += qty;
    subtotal += finalPrice(product) * qty;
    discountTotal += (product.price - finalPrice(product)) * qty;
  }
  const shippingFee = subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  return {
    itemCount,
    subtotal,
    shippingFee,
    discountTotal,
    grandTotal: subtotal + shippingFee,
  };
}
