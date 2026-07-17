// React.lazy로 동적 import되는 실제 컴포넌트. lazy+Suspense 경계 검증(ADR-0009 ④ 미검증 항목,
// ADR-0010)용 fixture — 커밋 시점에는 이미 resolve된 실제 함수 컴포넌트이므로 다른 composite와
// 동일하게 tag 기반 분류(isCompositeFiber)와 getDisplayName으로 이름이 잡혀야 한다.
function ReportRow({ label }: { label: string }) {
  return <li>{label}</li>;
}

export default function LazyReportView() {
  return (
    <div>
      <ul>
        <ReportRow label="Q1 매출" />
        <ReportRow label="Q2 매출" />
      </ul>
    </div>
  );
}
