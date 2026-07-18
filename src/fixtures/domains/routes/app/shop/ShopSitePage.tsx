import { useMemo, useState } from 'react';
import { SiteHeader } from './SiteHeader';
import { PromoBanner } from './PromoBanner';
import { CategoryNav } from './CategoryNav';
import { ProductSection } from './ProductSection';
import { SiteFooter } from './SiteFooter';
import { CartDrawer } from '../../../shop/CartDrawer';
import { PRODUCTS } from '../../../shop/data';
import { enrichProduct, type EnrichedProduct } from './enrich';

// 이 컴포넌트의 JSX는 같은 폴더의 page.tsx 안에서 렌더된다 — getSource("사용 위치", ADR-0007)가
// page.tsx를 돌려주므로 이 노드가 라우트 진입 노드(6각형, ADR-0028/0035)가 된다. domains/shop의
// Storefront(항상 마운트된 패널)와는 별개로, 사용자 요청으로 실제 URL 전환(/shop)에 반응하는
// "쿠팡스러운" 독립된 페이지를 보여주기 위한 fixture다 — 상품 데이터(PRODUCTS)와 장바구니 UI
// (CartDrawer)는 재사용하되, 표시 방식(배지/평점/할인)과 레이아웃은 이 라우트 전용이다.
export function ShopSitePage({ onNavigateHome }: { onNavigateHome: () => void }) {
  const [category, setCategory] = useState('all');
  const [cartItems, setCartItems] = useState<EnrichedProduct[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const enriched = useMemo(() => PRODUCTS.map((p, i) => enrichProduct(p, i)), []);
  const featured = useMemo(() => enriched.filter((p) => p.discountPercent >= 20), [enriched]);
  const filtered = useMemo(
    () => (category === 'all' ? enriched : enriched.filter((p) => p.category === category)),
    [enriched, category],
  );

  const addToCart = (product: EnrichedProduct) => setCartItems((prev) => [...prev, product]);

  return (
    <div className="shop-site">
      <SiteHeader cartCount={cartItems.length} onToggleCart={() => setCartOpen((v) => !v)} onNavigateHome={onNavigateHome} />
      <PromoBanner />
      <CategoryNav active={category} onSelect={setCategory} />
      {cartOpen && (
        <CartDrawer items={cartItems} onRemove={(index) => setCartItems((prev) => prev.filter((_, i) => i !== index))} />
      )}
      {category === 'all' && featured.length > 0 && <ProductSection title="🔥 오늘의 특가" products={featured} onAddToCart={addToCart} />}
      <ProductSection title={category === 'all' ? '전체 상품' : '카테고리 상품'} products={filtered} onAddToCart={addToCart} />
      <SiteFooter />
    </div>
  );
}
