import type { EnrichedProduct } from './enrich';
import { ShopProductCard } from './ShopProductCard';

export function ProductSection({
  title,
  products,
  onAddToCart,
}: {
  title: string;
  products: EnrichedProduct[];
  onAddToCart: (product: EnrichedProduct) => void;
}) {
  return (
    <section className="product-section">
      <h2>{title}</h2>
      <ul className="shop-card-grid">
        {products.map((product) => (
          <ShopProductCard key={product.id} product={product} onAddToCart={onAddToCart} />
        ))}
      </ul>
    </section>
  );
}
