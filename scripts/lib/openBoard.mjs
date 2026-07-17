// ADR-0020/0024/0025: 보드는 왼쪽 고정 패널이 아니라 플로팅 버튼 클릭으로 여는 전체화면
// 오버레이다(src/visualization/BoardOverlay.tsx). verify 스크립트가 React Flow 캔버스
// (.react-flow__node, .toolbar 등)를 보려면 페이지 로드 후 먼저 이 버튼을 눌러야 한다.
//
// `?board=off`로 띄운 페이지에는 이 버튼 자체가 마운트되지 않는다(src/main.tsx) — 그
// 시나리오를 검증하는 스크립트는 이 헬퍼를 호출하지 않는다.
export async function openBoard(page) {
  await page.getByRole('button', { name: 'render-board 열기' }).click();
}
