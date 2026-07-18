import { SORTS, type SortId } from '../catalog';

// 정렬 선택 — select onChange로 부모 state를 바꿔 그리드 전체가 재정렬(리렌더)된다. "사용자
// 조작 → 상태 변화 → 대량 리렌더"를 잔상으로 보기 좋은 트리거.
export function ProductToolbar({
  sort,
  onSortChange,
  total,
}: {
  sort: SortId;
  onSortChange: (id: SortId) => void;
  total: number;
}) {
  return (
    <div className="product-toolbar">
      <span className="product-toolbar__total">총 {total}개 상품</span>
      <label className="product-toolbar__sort">
        정렬
        <select value={sort} onChange={(e) => onSortChange(e.target.value as SortId)}>
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
