import { createPortal } from 'react-dom';
import type { EnrichedProduct } from '../enrich';
import { finalPrice } from '../enrich';
import { Button } from '../../../../shared/Button';
import { QuickViewGallery } from './QuickViewGallery';
import { PriceBlock } from '../catalog/PriceBlock';
import { StarRating } from '../catalog/StarRating';

// 포탈 표식(⧉, ADR-0028)의 트리거 — 모달 내용이 createPortal로 document.body에 순간이동한다.
// 컴포넌트 트리에서는 ShopSitePage의 자손이지만 실제 DOM은 body에 붙어, 보드가 "논리적 부모 아래
// 배치 + 포탈 표식"을 어떻게 그리는지 보여준다. PriceBlock/StarRating을 재사용해 크로스-그룹
// 간선도 만든다(같은 컴포넌트가 catalog 카드와 이 모달 양쪽에서 쓰임).
export function ProductQuickView({ product, onClose, onAddToCart }: {
  product: EnrichedProduct;
  onClose: () => void;
  onAddToCart: (product: EnrichedProduct) => void;
}) {
  return createPortal(
    <div className="qv-overlay" role="dialog" aria-label={`${product.name} 상세`} onClick={onClose}>
      <div className="qv-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="qv-modal__close" onClick={onClose} aria-label="닫기">
          ×
        </button>
        <QuickViewGallery category={product.category} />
        <div className="qv-modal__info">
          <h3>{product.name}</h3>
          <StarRating rating={product.rating} reviewCount={product.reviewCount} />
          <PriceBlock product={product} />
          <p className="qv-modal__stock">재고 {product.stock}개 · {product.badge}</p>
          <Button label={`장바구니 담기 (${finalPrice(product).toLocaleString()}원)`} onClick={() => { onAddToCart(product); onClose(); }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
