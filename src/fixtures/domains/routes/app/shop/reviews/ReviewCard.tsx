import { StarRating } from '../catalog/StarRating';

export interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
}

// 리뷰 한 장 — LazyReviewList가 여러 개 렌더하므로 같은 종류 형제 ≥5로 리스트 접기가 걸린다.
// StarRating을 재사용해 catalog/모달과 함께 크로스-그룹 간선을 하나 더 만든다.
export function ReviewCard({ review }: { review: Review }) {
  return (
    <li className="review-card">
      <div className="review-card__head">
        <span className="review-card__author">{review.author}</span>
        <StarRating rating={review.rating} />
      </div>
      <p className="review-card__text">{review.text}</p>
    </li>
  );
}
