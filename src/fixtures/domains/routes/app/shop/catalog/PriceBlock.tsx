import type { EnrichedProduct } from '../enrich';
import { finalPrice } from '../enrich';
import { DiscountBadge } from './DiscountBadge';

// 깊은 트리의 한 단계 — ProductCard > ProductMeta > PriceBlock > DiscountBadge. LOD/간선 감쇠
// (ADR-0041/0047)가 깊이에 따라 어떻게 죽고 사는지 보기 위해 일부러 여러 단계로 나눈다.
export function PriceBlock({ product }: { product: EnrichedProduct }) {
  const price = finalPrice(product);
  return (
    <div className="price-block">
      <div className="price-block__row">
        <DiscountBadge percent={product.discountPercent} />
        <span className="price-block__final">{price.toLocaleString()}원</span>
      </div>
      {product.discountPercent > 0 && (
        <span className="price-block__original">{product.price.toLocaleString()}원</span>
      )}
    </div>
  );
}
