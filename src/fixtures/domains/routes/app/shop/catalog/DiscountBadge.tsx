export function DiscountBadge({ percent }: { percent: number }) {
  if (percent <= 0) return null;
  return <span className="discount-badge">{percent}%</span>;
}
