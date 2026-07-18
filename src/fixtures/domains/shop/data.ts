export interface Product {
  id: string;
  name: string;
  price: number;
  category: 'apparel' | 'accessories' | 'footwear';
}

export const CATEGORIES = [
  { id: 'all', label: '전체' },
  { id: 'apparel', label: '의류' },
  { id: 'accessories', label: '액세서리' },
  { id: 'footwear', label: '신발' },
] as const;

export const PRODUCTS: Product[] = [
  { id: 'p1', name: '리넨 셔츠', price: 42000, category: 'apparel' },
  { id: 'p2', name: '와이드 데님', price: 58000, category: 'apparel' },
  { id: 'p3', name: '오버사이즈 니트', price: 39000, category: 'apparel' },
  { id: 'p4', name: '레더 벨트', price: 21000, category: 'accessories' },
  { id: 'p5', name: '캔버스 토트백', price: 33000, category: 'accessories' },
  { id: 'p6', name: '실버 목걸이', price: 27000, category: 'accessories' },
  { id: 'p7', name: '러닝화', price: 89000, category: 'footwear' },
  { id: 'p8', name: '캔버스 스니커즈', price: 65000, category: 'footwear' },
  { id: 'p9', name: '앵클 부츠', price: 112000, category: 'footwear' },
];
