// /shop 라우트 전용 상품 카탈로그. domains/shop/data.ts(항상 마운트된 Storefront용, 상품 9개)와
// 별개로, 이 라우트는 "대량 컴포넌트 + 리스트 접기(ADR-0046) + 깊은 트리"를 제대로 보여주려고
// 상품 수를 크게 늘렸다 — 한 카테고리 그리드에 같은 종류(ProductCard) 형제가 수십 개라
// 리스트 접기가 자연스럽게 걸리고, 카드 하나가 다시 여러 하위 컴포넌트로 갈라져 노드 수가 는다.

export type CategoryId = 'apparel' | 'accessories' | 'footwear' | 'living';

export interface Product {
  id: string;
  name: string;
  price: number;
  category: CategoryId;
}

export const CATEGORIES = [
  { id: 'all', label: '전체' },
  { id: 'apparel', label: '의류' },
  { id: 'accessories', label: '액세서리' },
  { id: 'footwear', label: '신발' },
  { id: 'living', label: '리빙' },
] as const;

// 사람이 읽어도 말이 되는 이름을 유지하되(랜덤 생성 아님), 카테고리별로 넉넉히 둔다.
export const PRODUCTS: Product[] = [
  { id: 'a1', name: '리넨 셔츠', price: 42000, category: 'apparel' },
  { id: 'a2', name: '와이드 데님', price: 58000, category: 'apparel' },
  { id: 'a3', name: '오버사이즈 니트', price: 39000, category: 'apparel' },
  { id: 'a4', name: '워시드 후디', price: 47000, category: 'apparel' },
  { id: 'a5', name: '코튼 슬랙스', price: 51000, category: 'apparel' },
  { id: 'a6', name: '경량 패딩', price: 118000, category: 'apparel' },
  { id: 'a7', name: '스트라이프 티셔츠', price: 24000, category: 'apparel' },
  { id: 'a8', name: '울 블레이저', price: 139000, category: 'apparel' },

  { id: 'c1', name: '레더 벨트', price: 21000, category: 'accessories' },
  { id: 'c2', name: '캔버스 토트백', price: 33000, category: 'accessories' },
  { id: 'c3', name: '실버 목걸이', price: 27000, category: 'accessories' },
  { id: 'c4', name: '울 비니', price: 18000, category: 'accessories' },
  { id: 'c5', name: '가죽 카드지갑', price: 29000, category: 'accessories' },
  { id: 'c6', name: '선글라스', price: 46000, category: 'accessories' },
  { id: 'c7', name: '실크 스카프', price: 34000, category: 'accessories' },

  { id: 'f1', name: '러닝화', price: 89000, category: 'footwear' },
  { id: 'f2', name: '캔버스 스니커즈', price: 65000, category: 'footwear' },
  { id: 'f3', name: '앵클 부츠', price: 112000, category: 'footwear' },
  { id: 'f4', name: '로퍼', price: 78000, category: 'footwear' },
  { id: 'f5', name: '샌들', price: 43000, category: 'footwear' },
  { id: 'f6', name: '첼시 부츠', price: 128000, category: 'footwear' },

  { id: 'l1', name: '세라믹 머그', price: 15000, category: 'living' },
  { id: 'l2', name: '리넨 쿠션', price: 26000, category: 'living' },
  { id: 'l3', name: '우드 트레이', price: 32000, category: 'living' },
  { id: 'l4', name: '아로마 캔들', price: 22000, category: 'living' },
  { id: 'l5', name: '무선 조명', price: 54000, category: 'living' },
  { id: 'l6', name: '코튼 블랭킷', price: 61000, category: 'living' },
];

export const SORTS = [
  { id: 'popular', label: '인기순' },
  { id: 'priceAsc', label: '낮은 가격순' },
  { id: 'priceDesc', label: '높은 가격순' },
] as const;

export type SortId = (typeof SORTS)[number]['id'];
