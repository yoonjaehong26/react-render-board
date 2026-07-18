// 공유 컨테이너 SharedCard가 렌더하는 **별도 파일** 자식 → CardBody.tsx가 독립 그룹(cross-group
// 자식)이 된다. 이게 SharedCard를 "자식 있는 공유 컨테이너"로 만든다(증분2 검증용).
export function CardBody() {
  return <div className="demo-card-body">card body</div>;
}
