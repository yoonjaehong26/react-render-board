// 여러 곳(ProductCard, 리뷰, 퀵뷰)에서 재사용되는 공유 프레젠테이션 컴포넌트 — groupHint가
// "사용 위치"라(ADR-0007) 쓰는 파일마다 다른 그룹으로 잡혀 크로스-그룹 간선을 만든다.
export function StarRating({ rating, reviewCount }: { rating: number; reviewCount?: number }) {
  const full = Math.round(rating);
  return (
    <span className="star-rating">
      <span className="star-rating__stars" aria-hidden>
        {'★'.repeat(full)}
        {'☆'.repeat(5 - full)}
      </span>
      <span className="star-rating__score">{rating.toFixed(1)}</span>
      {reviewCount !== undefined && <span className="star-rating__count">({reviewCount})</span>}
    </span>
  );
}
