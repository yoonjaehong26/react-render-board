import { PRODUCTS, type Product } from './data';
import { ProductCard } from './ProductCard';

// PRODUCTS 9개가 카테고리 필터 없이 전부 렌더되면 ProductCard 같은-종류 형제가 ≥5개라
// 리스트 접기(ADR-0046)가 실제로 걸린다 — "×N" 배지가 그럴듯한 화면에서 자연스럽게 보이는
// 실증 데모를 겸한다.
export function ProductGrid({
  category,
  onAddToCart,
}: {
  category: string;
  onAddToCart: (product: Product) => void;
}) {
  const visible = category === 'all' ? PRODUCTS : PRODUCTS.filter((p) => p.category === category);
  return (
    <ul className="product-grid">
      {visible.map((product) => (
        <ProductCard key={product.id} product={product} onAddToCart={onAddToCart} />
      ))}
    </ul>
  );
}
