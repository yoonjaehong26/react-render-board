import { ClassCounter } from '../legacy/ClassCounter';
import { ErrorBoundaryDemo } from '../resilience/ErrorBoundaryDemo';
import { TransitionDemo } from '../concurrent/TransitionDemo';
import { SuspenseDemo } from '../asyncData/SuspenseDemo';

// ADR-0009가 미검증으로 남긴 네 가지 패턴 — class 컴포넌트, 에러 바운더리, useTransition,
// Suspense(use()) — 를 한 도메인으로 묶어 DemoApp에 마운트한다 (ADR-0010). 각 패턴이
// serializeFiberTree/groupHint/캔버스 파이프라인을 독립적으로 통과하는지 확인하는 게
// 목적이라 상호작용 로직은 각 하위 fixture 파일에 있다.
export function AdvancedPatterns() {
  return (
    <div>
      <h2>advanced patterns</h2>
      <ClassCounter />
      <ErrorBoundaryDemo />
      <TransitionDemo />
      <SuspenseDemo />
    </div>
  );
}
