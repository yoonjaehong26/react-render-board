import { Button } from '../../../../shared/Button';

export function QuantityStepper({ qty, onChange }: { qty: number; onChange: (qty: number) => void }) {
  return (
    <span className="qty-stepper">
      <Button label="−" variant="ghost" onClick={() => onChange(Math.max(1, qty - 1))} />
      <span className="qty-stepper__value">{qty}</span>
      <Button label="+" variant="ghost" onClick={() => onChange(qty + 1)} />
    </span>
  );
}
