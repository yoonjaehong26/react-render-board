import type { EnrichedProduct } from './enrich';
import { Button } from '../../../shared/Button';

function RatingStars({ rating, reviewCount }: { rating: number; reviewCount: number }) {
  return (
    <div className="shop-card__rating">
      <span aria-hidden>{'★'.repeat(Math.round(rating))}</span>
      <span className="shop-card__review-count">({reviewCount})</span>
    </div>
  );
}

function PriceBlock({ price, discountPercent }: { price: number; discountPercent: number }) {
  const finalPrice = Math.round((price * (100 - discountPercent)) / 100);
  return (
    <div className="shop-card__price-block">
      {discountPercent > 0 && <span className="shop-card__discount">{discountPercent}%</span>}
      <span className="shop-card__final-price">{finalPrice.toLocaleString()}원</span>
      {discountPercent > 0 && <span className="shop-card__original-price">{price.toLocaleString()}원</span>}
    </div>
  );
}

export function ShopProductCard({
  product,
  onAddToCart,
}: {
  product: EnrichedProduct;
  onAddToCart: (product: EnrichedProduct) => void;
}) {
  return (
    <li className="shop-card">
      <span className={`shop-card__badge shop-card__badge--${product.badge === '로켓배송' ? 'rocket' : 'free'}`}>
        {product.badge}
      </span>
      <div className={`shop-card__image shop-card__image--${product.category}`} aria-hidden />
      <span className="shop-card__name">{product.name}</span>
      <PriceBlock price={product.price} discountPercent={product.discountPercent} />
      <RatingStars rating={product.rating} reviewCount={product.reviewCount} />
      <Button label="담기" onClick={() => onAddToCart(product)} />
    </li>
  );
}
