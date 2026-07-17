import type { RawFiberNode } from './types';

// docs/decisions/0005-exp1-fiber-extraction-feasibility.md에 기록된 실제 exp1 트리 구조를 그대로 흉내낸 fixture.
// App -> ThemeContext.Provider(익명) -> ThemedLabel / Counter / ItemList -> ListItem x3
// ItemList/ListItem은 일부러 'catalog' 그룹으로 지정해, 같은 부모-자식 관계라도
// 그룹(도메인) 경계를 넘나드는 엣지가 생기는 실제 상황을 재현한다.
export const sampleSmall: RawFiberNode[] = [
  { id: 1, displayName: 'App', kind: 'composite', parentId: null, group: 'app-shell' },
  { id: 2, displayName: '(anonymous)', kind: 'composite', parentId: 1, group: 'app-shell' },
  { id: 3, displayName: 'ThemedLabel', kind: 'composite', parentId: 2, group: 'app-shell' },
  { id: 4, displayName: 'div', kind: 'host', parentId: 3, group: 'app-shell' },
  { id: 5, displayName: 'Counter', kind: 'composite', parentId: 2, group: 'app-shell' },
  { id: 6, displayName: 'button', kind: 'host', parentId: 5, group: 'app-shell' },
  { id: 7, displayName: 'span', kind: 'host', parentId: 5, group: 'app-shell' },
  { id: 8, displayName: 'button', kind: 'host', parentId: 5, group: 'app-shell' },
  { id: 9, displayName: 'ItemList', kind: 'composite', parentId: 2, group: 'catalog' },
  { id: 10, displayName: 'ul', kind: 'host', parentId: 9, group: 'catalog' },
  { id: 11, displayName: 'ListItem', kind: 'composite', parentId: 10, group: 'catalog' },
  { id: 12, displayName: 'li', kind: 'host', parentId: 11, group: 'catalog' },
  { id: 13, displayName: 'ListItem', kind: 'composite', parentId: 10, group: 'catalog' },
  { id: 14, displayName: 'li', kind: 'host', parentId: 13, group: 'catalog' },
  { id: 15, displayName: 'ListItem', kind: 'composite', parentId: 10, group: 'catalog' },
  { id: 16, displayName: 'li', kind: 'host', parentId: 15, group: 'catalog' },
];
