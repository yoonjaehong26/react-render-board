import type { Product } from './catalog';

export interface EnrichedProduct extends Product {
  rating: number;
  reviewCount: number;
  discountPercent: number;
  badge: '로켓배송' | '무료배송';
  stock: number;
}

// 실제 상품 데이터(catalog.ts)는 그대로 두고, 이 라우트에서 필요한 "쿠팡스러운" 표시용 필드
// (평점/리뷰수/할인율/배지/재고)를 id 해시 기반 결정적 공식으로 덧붙인다. Math.random()을 안 쓰는
// 이유는 새로고침·리렌더마다 값이 흔들리면 "지금 이 커밋에서 뭐가 바뀌었나"를 보는 이 도구의
// 취지와 안 맞기 때문이다(잔상/props 흐름은 "진짜 바뀐 것만" 잡혀야 한다).
function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return h;
}

export function enrichProduct(product: Product): EnrichedProduct {
  const h = hash(product.id);
  return {
    ...product,
    rating: 3.5 + (h % 15) / 10,
    reviewCount: 40 + (h % 900),
    discountPercent: (h % 40),
    badge: h % 2 === 0 ? '로켓배송' : '무료배송',
    stock: 1 + (h % 30),
  };
}

export function finalPrice(product: EnrichedProduct): number {
  return Math.round((product.price * (100 - product.discountPercent)) / 100);
}
