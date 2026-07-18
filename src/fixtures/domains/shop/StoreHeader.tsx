import { Button } from '../shared/Button';

export function StoreHeader({ cartCount, onToggleCart }: { cartCount: number; onToggleCart: () => void }) {
  return (
    <header className="store-header">
      <span className="store-header__logo">Rendera</span>
      <Button label={`장바구니 (${cartCount})`} onClick={onToggleCart} />
    </header>
  );
}
