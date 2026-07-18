import { ReviewCard, type Review } from './ReviewCard';

// React.lazy로 동적 import되는 실제 컴포넌트(reports/LazyReportView.tsx와 같은 패턴). 커밋 시점엔
// 이미 resolve된 함수 컴포넌트라 다른 composite처럼 이름/분류가 잡혀야 한다. 리뷰 8개를 렌더해
// ReviewCard 리스트 접기를 만든다.
const REVIEWS: Review[] = [
  { id: 'r1', author: '민준', rating: 5, text: '핏이 딱 맞아요. 재구매 의사 있습니다.' },
  { id: 'r2', author: '서연', rating: 4, text: '색감 예쁘고 배송 빨랐어요.' },
  { id: 'r3', author: '도윤', rating: 5, text: '가격 대비 만족합니다.' },
  { id: 'r4', author: '하은', rating: 3, text: '생각보다 얇네요. 무난합니다.' },
  { id: 'r5', author: '지호', rating: 4, text: '무난하게 잘 입고 있어요.' },
  { id: 'r6', author: '수아', rating: 5, text: '퀄리티 좋아요. 강추!' },
  { id: 'r7', author: '예준', rating: 4, text: '사이즈 정사이즈입니다.' },
  { id: 'r8', author: '유나', rating: 2, text: '마감이 조금 아쉬워요.' },
];

export default function LazyReviewList() {
  return (
    <ul className="review-list">
      {REVIEWS.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </ul>
  );
}
