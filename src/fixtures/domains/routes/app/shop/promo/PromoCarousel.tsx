import { useEffect, useState } from 'react';
import { CountdownTimer } from './CountdownTimer';

const SLIDES = [
  { text: '⚡ 오늘의 번개세일 — 전 품목 최대 40%', withTimer: true },
  { text: '🚚 로켓배송 — 자정 전 주문 시 내일 도착', withTimer: false },
  { text: '🎁 첫 구매 15% 쿠폰 지급', withTimer: false },
];
const ROTATE_MS = 3500;

// 3.5초마다 슬라이드를 바꾸는 회전 배너 — 저빈도 주기 상태 변화. 첫 슬라이드는 CountdownTimer를
// 품어(1초 틱) "느린 회전 + 그 안의 빠른 카운트다운"이라는 서로 다른 리듬을 한 서브트리에 둔다.
export function PromoCarousel() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), ROTATE_MS);
    return () => clearInterval(id);
  }, []);
  const slide = SLIDES[index];
  return (
    <div className="promo-carousel">
      <span className="promo-carousel__text">{slide.text}</span>
      {slide.withTimer && <CountdownTimer />}
      <span className="promo-carousel__dots" aria-hidden>
        {SLIDES.map((_, i) => (
          <span key={i} className={`promo-carousel__dot${i === index ? ' promo-carousel__dot--on' : ''}`} />
        ))}
      </span>
    </div>
  );
}
