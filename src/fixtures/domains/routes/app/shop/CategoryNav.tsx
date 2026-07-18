import { CATEGORIES } from '../../../shop/data';

export function CategoryNav({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  return (
    <nav className="category-nav">
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`category-nav__item${c.id === active ? ' category-nav__item--active' : ''}`}
          onClick={() => onSelect(c.id)}
        >
          {c.label}
        </button>
      ))}
    </nav>
  );
}
