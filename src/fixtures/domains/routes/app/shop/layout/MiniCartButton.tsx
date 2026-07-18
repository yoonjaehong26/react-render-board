import { Button } from '../../../../shared/Button';

export function MiniCartButton({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <span className="mini-cart">
      <Button label={`장바구니 ${count}`} onClick={onOpen} />
    </span>
  );
}
