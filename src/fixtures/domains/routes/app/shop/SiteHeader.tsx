import { useState } from 'react';
import { Button } from '../../../shared/Button';

export function SiteHeader({
  cartCount,
  onToggleCart,
  onNavigateHome,
}: {
  cartCount: number;
  onToggleCart: () => void;
  onNavigateHome: () => void;
}) {
  const [query, setQuery] = useState('');

  return (
    <header className="site-header">
      <button type="button" className="site-header__logo" onClick={onNavigateHome}>
        Rendera
      </button>
      <input
        className="site-header__search"
        type="search"
        placeholder="상품을 검색해보세요"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Button label={`장바구니 ${cartCount}`} onClick={onToggleCart} />
      <button type="button" className="site-header__back" onClick={onNavigateHome}>
        ← 데모 홈으로
      </button>
    </header>
  );
}
