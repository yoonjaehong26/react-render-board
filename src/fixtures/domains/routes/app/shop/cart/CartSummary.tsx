import type { PricingSummary } from '../pricing';

// props 흐름(ADR-0032)의 착지점 — ShopSitePage가 계산한 pricing(PricingSummary) 객체를
// CartDrawer를 거쳐 여기까지 drilling한다. 장바구니가 바뀔 때마다 pricing이 "새 객체"라 이 노드의
// props가 바뀌고, 보드에서 CartDrawer나 CartSummary를 클릭해 pricing 행을 누르면 참조 추적/변경
// 잔상이 이 서브트리에서 발동하는 걸 볼 수 있다. row(요약 항목)들도 같은 종류 형제라 접힘 대상.
function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`cart-summary__row${accent ? ' cart-summary__row--accent' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function CartSummary({ pricing }: { pricing: PricingSummary }) {
  return (
    <div className="cart-summary">
      <SummaryRow label={`상품금액 (${pricing.itemCount}개)`} value={`${pricing.subtotal.toLocaleString()}원`} />
      <SummaryRow label="할인" value={`-${pricing.discountTotal.toLocaleString()}원`} />
      <SummaryRow label="배송비" value={pricing.shippingFee === 0 ? '무료' : `${pricing.shippingFee.toLocaleString()}원`} />
      <SummaryRow label="결제예정금액" value={`${pricing.grandTotal.toLocaleString()}원`} accent />
    </div>
  );
}
