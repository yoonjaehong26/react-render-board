import { Suspense, lazy, useState } from 'react';
import { Button } from '../../../../shared/Button';

// Suspense 경계 표식(⏳, ADR-0028)의 트리거 — "리뷰 더보기"를 누르면 리뷰 목록을 lazy import한다.
// dev 서버(로컬 모듈)에선 순식간에 resolve돼 fallback이 안 보일 수 있어, reports/ReportsPanel과
// 똑같이 짧은 지연을 일부러 더해 Suspense 경계가 실제로 화면·보드에 잡히게 한다.
const LazyReviewList = lazy(() =>
  import('./LazyReviewList').then(
    (mod) => new Promise<typeof mod>((resolve) => setTimeout(() => resolve(mod), 500)),
  ),
);

export function ReviewsSection() {
  const [open, setOpen] = useState(false);
  return (
    <section className="reviews-section">
      <h2>상품 리뷰</h2>
      <Button label={open ? '리뷰 접기' : '리뷰 더보기'} onClick={() => setOpen((v) => !v)} />
      {open && (
        <Suspense fallback={<p className="reviews-section__loading">리뷰 불러오는 중…</p>}>
          <LazyReviewList />
        </Suspense>
      )}
    </section>
  );
}
