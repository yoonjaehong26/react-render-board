import { CATEGORIES } from './data';
import { Button } from '../shared/Button';

export function CategoryFilterBar({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  return (
    <div className="category-filter-bar">
      {CATEGORIES.map((c) => (
        <Button
          key={c.id}
          label={c.label}
          variant={c.id === active ? 'primary' : 'ghost'}
          onClick={() => onSelect(c.id)}
        />
      ))}
    </div>
  );
}
