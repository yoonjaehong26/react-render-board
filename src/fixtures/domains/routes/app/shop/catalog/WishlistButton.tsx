import { useState } from 'react';

// "자기 state로 리렌더"의 대표 예 — 부모 props와 무관하게 하트 토글 state를 갖는다. 클릭하면
// 이 노드만 리렌더돼(변경 잔상이 이 노드에서만 발동), StateFlowDemo의 InternalStatePanel과
// 같은 성격을 카드 안에서 자연스럽게 재현한다.
export function WishlistButton({ productName }: { productName: string }) {
  const [wished, setWished] = useState(false);
  return (
    <button
      type="button"
      className={`wishlist-button${wished ? ' wishlist-button--on' : ''}`}
      onClick={() => setWished((v) => !v)}
      aria-pressed={wished}
      aria-label={`${productName} 찜하기`}
    >
      {wished ? '♥' : '♡'}
    </button>
  );
}
