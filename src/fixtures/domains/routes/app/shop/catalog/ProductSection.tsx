import type { EnrichedProduct } from '../enrich';
import { ProductGrid } from './ProductGrid';

export function ProductSection({
  title,
  products,
  onQuickView,
  onAddToCart,
}: {
  title: string;
  products: EnrichedProduct[];
  onQuickView: (product: EnrichedProduct) => void;
  onAddToCart: (product: EnrichedProduct) => void;
}) {
  return (
    <section className="product-section-v2">
      <h2>
        {title} <span className="product-section-v2__count">{products.length}개</span>
      </h2>
      <ProductGrid products={products} onQuickView={onQuickView} onAddToCart={onAddToCart} />
    </section>
  );
}
