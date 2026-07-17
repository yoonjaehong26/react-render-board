import { useState } from 'react';
import { Button } from '../shared/Button';

// ADR-0007 fixture(다른 도메인의 shared 컴포넌트를 렌더하는 도메인 컴포넌트)를 이어받되,
// "상품 담기"로 실제 노드 추가를 유발하는 상호작용을 더한다.
function CheckoutItem({ label }: { label: string }) {
  return <li>{label}</li>;
}

export function CheckoutPanel() {
  const [lineItems, setLineItems] = useState(['sneakers']);

  return (
    <section>
      <h2>checkout</h2>
      <ul>
        {lineItems.map((item) => (
          <CheckoutItem key={item} label={item} />
        ))}
      </ul>
      <Button label="상품 담기" onClick={() => setLineItems((prev) => [...prev, `item-${prev.length + 1}`])} />
      <Button label="pay" variant="ghost" />
    </section>
  );
}
