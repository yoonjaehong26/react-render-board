import type { CategoryId } from '../catalog';

// 퀵뷰 좌측 썸네일 갤러리 — 같은 종류(썸네일) 형제 4개를 렌더해 리스트 접기 조건을 카드 밖에서도
// 한 번 더 만든다.
export function QuickViewGallery({ category }: { category: CategoryId }) {
  return (
    <div className="qv-gallery">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`qv-gallery__thumb qv-gallery__thumb--${category}`} />
      ))}
    </div>
  );
}
