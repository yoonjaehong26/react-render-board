import { CATEGORIES } from '../catalog';

export function CategoryTabs({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  return (
    <nav className="category-tabs">
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`category-tabs__item${c.id === active ? ' category-tabs__item--active' : ''}`}
          onClick={() => onSelect(c.id)}
        >
          {c.label}
        </button>
      ))}
    </nav>
  );
}
