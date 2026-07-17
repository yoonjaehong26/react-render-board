import { createContext, useContext, useState } from 'react';
import { Button } from '../shared/Button';

// exp1(ADR-0005)의 테스트 트리(Context, 리스트, state 업데이트)를 그대로 이어받는다.
// 라이브 MVP에서는 "리스트 항목 추가/삭제" 상호작용을 더해 커밋마다 노드가 실제로 생기고
// 사라지는 상황을 만든다 — 정적 트리로는 레이아웃 재계산 전략(visualization/lib/layout.ts)을
// 검증할 수 없기 때문이다.
const ThemeContext = createContext('light');

function ThemedLabel() {
  const theme = useContext(ThemeContext);
  return <span>theme: {theme}</span>;
}

function ListItem({ label }: { label: string }) {
  return <li>{label}</li>;
}

function ItemList() {
  const [items, setItems] = useState(['a', 'b', 'c']);
  return (
    <div>
      <ul>
        {items.map((item) => (
          <ListItem key={item} label={item} />
        ))}
      </ul>
      <Button label="항목 추가" onClick={() => setItems((prev) => [...prev, `item-${prev.length + 1}`])} />
      <Button label="항목 제거" variant="ghost" onClick={() => setItems((prev) => prev.slice(0, -1))} />
    </div>
  );
}

function Counter() {
  const [count, setCount] = useState(0);
  return <Button label={`count is ${count}`} onClick={() => setCount((c) => c + 1)} />;
}

export function AppShell() {
  return (
    <ThemeContext.Provider value="dark">
      <div>
        <h2>shell</h2>
        <ThemedLabel />
        <Counter />
        <ItemList />
      </div>
    </ThemeContext.Provider>
  );
}
