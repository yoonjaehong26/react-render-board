import type { Product } from './data';
import { Button } from '../shared/Button';

function ProductImage({ category }: { category: Product['category'] }) {
  return <div className={`product-card__image product-card__image--${category}`} aria-hidden />;
}

function ProductInfo({ name, price }: { name: string; price: number }) {
  return (
    <div className="product-card__info">
      <span className="product-card__name">{name}</span>
      <span className="product-card__price">{price.toLocaleString()}원</span>
    </div>
  );
}

export function ProductCard({ product, onAddToCart }: { product: Product; onAddToCart: (product: Product) => void }) {
  return (
    <li className="product-card">
      <ProductImage category={product.category} />
      <ProductInfo name={product.name} price={product.price} />
      <Button label="담기" onClick={() => onAddToCart(product)} />
    </li>
  );
}
