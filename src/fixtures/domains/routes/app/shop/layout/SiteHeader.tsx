import { HeaderSearchBar } from './HeaderSearchBar';
import { MiniCartButton } from './MiniCartButton';

export function SiteHeader({
  cartCount,
  onSearch,
  onOpenCart,
  onNavigateHome,
}: {
  cartCount: number;
  onSearch: (query: string) => void;
  onOpenCart: () => void;
  onNavigateHome: () => void;
}) {
  return (
    <header className="site-header-v2">
      <button type="button" className="site-header-v2__logo" onClick={onNavigateHome}>
        Rendera
      </button>
      <HeaderSearchBar onSubmit={onSearch} />
      <MiniCartButton count={cartCount} onOpen={onOpenCart} />
      <button type="button" className="site-header-v2__back" onClick={onNavigateHome}>
        ← 데모 홈
      </button>
    </header>
  );
}
