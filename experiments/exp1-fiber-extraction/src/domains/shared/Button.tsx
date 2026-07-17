// 스파이크 전용: 공유 UI 컴포넌트가 다른 도메인 파일에서 렌더될 때 bippy getSource가
// "정의 위치"(이 파일)를 주는지 "사용 위치"(호출부 파일)를 주는지 확인하기 위한 fixture.
export function Button({ label }: { label: string }) {
  return <button type="button">{label}</button>
}
