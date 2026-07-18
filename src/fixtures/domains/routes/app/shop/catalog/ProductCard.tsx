import type { EnrichedProduct } from '../enrich';
import { Button } from '../../../../shared/Button';
import { ProductThumbnail } from './ProductThumbnail';
import { ProductMeta } from './ProductMeta';
import { WishlistButton } from './WishlistButton';

// 리스트 접기(ADR-0046)의 주역 — ProductGrid가 이 카드를 카테고리당 수~수십 개 렌더하므로 같은
// 종류 형제 ≥5로 "×N" 배지가 걸린다. 카드 하나가 다시 Thumbnail/Meta(→Price→Discount, Rating)/
// Wishlist/Button 여러 자식으로 갈라져, 접힌 대표 하나를 펼치면 납득 가능한 하위 트리가 보인다.
export function ProductCard({
  product,
  onQuickView,
  onAddToCart,
}: {
  product: EnrichedProduct;
  onQuickView: (product: EnrichedProduct) => void;
  onAddToCart: (product: EnrichedProduct) => void;
}) {
  return (
    <li className="product-card-v2">
      <button type="button" className="product-card-v2__thumb-btn" onClick={() => onQuickView(product)}>
        <ProductThumbnail category={product.category} badge={product.badge} />
      </button>
      <WishlistButton productName={product.name} />
      <ProductMeta product={product} />
      <div className="product-card-v2__actions">
        <Button label="담기" onClick={() => onAddToCart(product)} />
        <Button label="상세" variant="ghost" onClick={() => onQuickView(product)} />
      </div>
    </li>
  );
}
