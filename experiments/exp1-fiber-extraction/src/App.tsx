import { createContext, useContext, useState } from 'react'
import { CheckoutPanel } from './domains/checkout/CheckoutPanel'

// Fiber 추출 실험용 테스트 트리: Context, 리스트(children), 중첩 컴포넌트를 섞어서
// 순회 로직이 실제 구조를 정확히 뽑아내는지 확인한다.
const ThemeContext = createContext('light')

function ThemedLabel() {
  const theme = useContext(ThemeContext)
  return <span>theme: {theme}</span>
}

function ListItem({ label }: { label: string }) {
  return <li>{label}</li>
}

function ItemList({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item) => (
        <ListItem key={item} label={item} />
      ))}
    </ul>
  )
}

function Counter() {
  const [count, setCount] = useState(0)
  return (
    <button type="button" onClick={() => setCount((c) => c + 1)}>
      count is {count}
    </button>
  )
}

function App() {
  return (
    <ThemeContext.Provider value="dark">
      <div>
        <h1>exp1: fiber extraction</h1>
        <ThemedLabel />
        <Counter />
        <ItemList items={['a', 'b', 'c']} />
        <CheckoutPanel />
      </div>
    </ThemeContext.Provider>
  )
}

export default App
