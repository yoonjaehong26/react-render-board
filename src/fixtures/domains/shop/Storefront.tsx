import { useState } from 'react';
import { StoreHeader } from './StoreHeader';
import { CategoryFilterBar } from './CategoryFilterBar';
import { ProductGrid } from './ProductGrid';
import { CartDrawer } from './CartDrawer';
import type { Product } from './data';

// 사용자 요청 fixture — 캡슐형 fixture(advanced/concurrent/portals 등)는 특정 React 패턴 하나를
// 검증하려는 목적이라 이름이 기능 중심이고 트리가 얕다(project-status.md 2절). 이 도메인은 반대로
// "Storefront > ProductGrid > ProductCard > ProductInfo"처럼 실제 쇼핑몰다운 이름/깊이를 보여주는
// 게 목적이라, 새 React 패턴을 검증하진 않는다(카테고리 필터로 인한 마운트/언마운트, 장바구니
// 담기/제거로 인한 리스트 갱신, ProductCard 9개 → 리스트 접기 ADR-0046이 걸리는 정도는 기존
// 기능의 자연스러운 부산물이다).
export function Storefront() {
  const [category, setCategory] = useState('all');
  const [cartItems, setCartItems] = useState<Product[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <section className="storefront">
      <h2>storefront</h2>
      <StoreHeader cartCount={cartItems.length} onToggleCart={() => setCartOpen((v) => !v)} />
      <CategoryFilterBar active={category} onSelect={setCategory} />
      <ProductGrid category={category} onAddToCart={(p) => setCartItems((prev) => [...prev, p])} />
      {cartOpen && (
        <CartDrawer
          items={cartItems}
          onRemove={(index) => setCartItems((prev) => prev.filter((_, i) => i !== index))}
        />
      )}
    </section>
  );
}
