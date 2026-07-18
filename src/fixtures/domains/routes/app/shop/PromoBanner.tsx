import { useEffect, useState } from 'react';

const SLIDES = ['⚡ 오늘의 번개세일 — 전 품목 최대 40%', '🚚 로켓배송 — 자정 전 주문 시 내일 도착', '🎁 첫 구매 15% 쿠폰 지급'];
const ROTATE_MS = 3000;

// 실제 커머스 사이트의 회전 배너를 흉내낸 저빈도 주기 갱신(라이브피드의 10~240Hz와는 다른
// 대역 — "느긋하게 몇 초마다 바뀌는" 흔한 UI 패턴 하나를 이 라우트 트리 안에도 넣어둔다).
export function PromoBanner() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="promo-banner">
      <span>{SLIDES[index]}</span>
    </div>
  );
}
