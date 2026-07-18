import { useMemo, useState } from 'react';
import { SiteHeader } from './layout/SiteHeader';
import { SiteFooter } from './layout/SiteFooter';
import { PromoCarousel } from './promo/PromoCarousel';
import { CategoryTabs } from './catalog/CategoryTabs';
import { ProductToolbar } from './catalog/ProductToolbar';
import { ProductSection } from './catalog/ProductSection';
import { ProductQuickView } from './quickview/ProductQuickView';
import { CartDrawer } from './cart/CartDrawer';
import { ReviewsSection } from './reviews/ReviewsSection';
import { PRODUCTS, type SortId } from './catalog';
import { enrichProduct, type EnrichedProduct } from './enrich';
import { computePricing, type CartEntry } from './pricing';

// /shop 라우트의 최상위 조립 컴포넌트 — 이 컴포넌트의 JSX는 같은 폴더 page.tsx 안에서 렌더되므로
// getSource("사용 위치", ADR-0007)가 page.tsx를 돌려줘 라우트 진입 노드(6각형, ADR-0028)가 된다.
//
// 이 fixture가 보드에서 보여주려는 기능(사용자 요청 "필요한 요소 분석"):
//  - 대량 컴포넌트 + 리스트 접기(ADR-0046): ProductGrid가 카드 수십 개 → "×N"
//  - 포탈 표식(ADR-0028): ProductQuickView, CartDrawer 둘 다 createPortal
//  - Suspense 경계(ADR-0028): ReviewsSection이 lazy import
//  - 에러 바운더리(ADR-0028): 장바구니 결제(CheckoutErrorBoundary)
//  - props 흐름 + 변경 잔상(ADR-0032): 장바구니가 바뀔 때마다 pricing이 "새 객체"로 만들어져
//    CartDrawer→CartSummary로 drilling된다(아래 useMemo). 그 노드를 클릭해 pricing 행을 누르면
//    참조 추적/잔상이 발동한다.
//  - 상태 변화 잔상: CountdownTimer(1s)/PromoCarousel(3.5s)/WishlistButton/QuantityStepper 등
//    자기 state로 리렌더되는 노드들.
export function ShopSitePage({ onNavigateHome }: { onNavigateHome: () => void }) {
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<SortId>('popular');
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [quickView, setQuickView] = useState<EnrichedProduct | null>(null);

  const enriched = useMemo(() => PRODUCTS.map(enrichProduct), []);
  const featured = useMemo(() => enriched.filter((p) => p.discountPercent >= 25), [enriched]);

  const visible = useMemo(() => {
    const base = category === 'all' ? enriched : enriched.filter((p) => p.category === category);
    const sorted = [...base];
    if (sort === 'priceAsc') sorted.sort((a, b) => a.price - b.price);
    else if (sort === 'priceDesc') sorted.sort((a, b) => b.price - a.price);
    return sorted;
  }, [enriched, category, sort]);

  // 장바구니가 바뀔 때마다 pricing은 "새 객체"다 — 이게 props 흐름(ADR-0032)의 핵심 트리거다.
  // cart를 의존성으로 두어 담기/제거/수량변경 때만 다시 계산한다(무관한 리렌더엔 안 흔들림).
  const pricing = useMemo(() => computePricing(cart), [cart]);

  const addToCart = (product: EnrichedProduct) =>
    setCart((prev) => {
      const existing = prev.find((e) => e.product.id === product.id);
      if (existing) return prev.map((e) => (e.product.id === product.id ? { ...e, qty: e.qty + 1 } : e));
      return [...prev, { product, qty: 1 }];
    });

  const changeQty = (productId: string, qty: number) =>
    setCart((prev) => prev.map((e) => (e.product.id === productId ? { ...e, qty } : e)));

  const removeFromCart = (productId: string) =>
    setCart((prev) => prev.filter((e) => e.product.id !== productId));

  return (
    <div className="shop-site-v2">
      <SiteHeader
        cartCount={pricing.itemCount}
        onSearch={() => {}}
        onOpenCart={() => setCartOpen(true)}
        onNavigateHome={onNavigateHome}
      />
      <PromoCarousel />
      <CategoryTabs active={category} onSelect={setCategory} />
      <ProductToolbar sort={sort} onSortChange={setSort} total={visible.length} />

      {category === 'all' && featured.length > 0 && (
        <ProductSection title="🔥 오늘의 특가" products={featured} onQuickView={setQuickView} onAddToCart={addToCart} />
      )}
      <ProductSection
        title={category === 'all' ? '전체 상품' : '카테고리 상품'}
        products={visible}
        onQuickView={setQuickView}
        onAddToCart={addToCart}
      />
      <ReviewsSection />
      <SiteFooter />

      {quickView && (
        <ProductQuickView product={quickView} onClose={() => setQuickView(null)} onAddToCart={addToCart} />
      )}
      {cartOpen && (
        <CartDrawer
          entries={cart}
          pricing={pricing}
          onQtyChange={changeQty}
          onRemove={removeFromCart}
          onClose={() => setCartOpen(false)}
        />
      )}
    </div>
  );
}
