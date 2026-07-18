// 이 컴포넌트의 JSX는 같은 폴더의 page.tsx 안에서 렌더(사용)된다 — getSource("사용 위치",
// ADR-0007)가 page.tsx를 돌려주므로 이 노드의 그룹은 `page.tsx`가 되고, 그 그룹으로 처음
// 들어오는 진입 노드라 6각형으로 표시된다(도형 어휘, ADR-0028/0035).
export function RouteHome() {
  return (
    <div className="route-home">
      <h3>대시보드 (라우트 진입점)</h3>
      <p>이 노드는 groupHint가 page.tsx라 6각형으로 그려진다.</p>
    </div>
  );
}
