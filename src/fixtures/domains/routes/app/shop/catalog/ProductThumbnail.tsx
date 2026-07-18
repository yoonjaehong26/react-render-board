import type { CategoryId } from '../catalog';

// 카테고리별 색 placeholder + 배지 오버레이. 실제 이미지 대신 색 박스라 노드 수/트리 구조에만
// 집중한다(이 fixture의 목적은 "구조를 보드에서 어떻게 읽나"지 실제 상품 이미지가 아니다).
export function ProductThumbnail({
  category,
  badge,
}: {
  category: CategoryId;
  badge: '로켓배송' | '무료배송';
}) {
  return (
    <div className={`product-thumb product-thumb--${category}`}>
      <span className={`product-thumb__badge product-thumb__badge--${badge === '로켓배송' ? 'rocket' : 'free'}`}>
        {badge}
      </span>
    </div>
  );
}
