import type { EnrichedProduct } from '../enrich';
import { PriceBlock } from './PriceBlock';
import { StarRating } from './StarRating';

// 카드 하단 정보 묶음 — 이름/가격/평점을 한 단계 더 감싸 트리 깊이를 만든다.
export function ProductMeta({ product }: { product: EnrichedProduct }) {
  return (
    <div className="product-meta">
      <span className="product-meta__name">{product.name}</span>
      <PriceBlock product={product} />
      <StarRating rating={product.rating} reviewCount={product.reviewCount} />
    </div>
  );
}
