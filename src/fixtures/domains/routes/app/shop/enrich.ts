import type { Product } from '../../../shop/data';

export interface EnrichedProduct extends Product {
  rating: number;
  reviewCount: number;
  discountPercent: number;
  badge: '로켓배송' | '무료배송';
}

// 실제 상품 데이터는 그대로 두고(도메인 shop/data.ts 재사용), 이 라우트에서만 필요한
// "쿠팡스러운" 표시용 필드(평점/리뷰수/할인율/배지)를 index 기반 결정적 공식으로 덧붙인다.
// Math.random()을 안 쓰는 이유는 새로고침·리렌더마다 값이 흔들리면 "지금 이 커밋에서 뭐가
// 바뀌었나"를 보는 이 도구의 취지와 안 맞기 때문이다.
export function enrichProduct(product: Product, index: number): EnrichedProduct {
  return {
    ...product,
    rating: 3.5 + ((index * 7) % 15) / 10,
    reviewCount: 120 + index * 37,
    discountPercent: (index * 11) % 40,
    badge: index % 2 === 0 ? '로켓배송' : '무료배송',
  };
}
