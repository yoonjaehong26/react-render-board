import type { EnrichedProduct } from '../enrich';
import { ProductCard } from './ProductCard';

export function ProductGrid({
  products,
  onQuickView,
  onAddToCart,
}: {
  products: EnrichedProduct[];
  onQuickView: (product: EnrichedProduct) => void;
  onAddToCart: (product: EnrichedProduct) => void;
}) {
  return (
    <ul className="product-grid-v2">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onQuickView={onQuickView} onAddToCart={onAddToCart} />
      ))}
    </ul>
  );
}
