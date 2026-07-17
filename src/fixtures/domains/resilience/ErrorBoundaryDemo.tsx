import { Component, useState, type ReactNode } from 'react';
import { Button } from '../shared/Button';

// 에러 바운더리 fixture. 하위 트리가 렌더 중 에러를 던졌을 때
// 1. 계측(hooking/fiberInspector.ts의 try/catch, architecture.md 설계 원칙 1)이 죽지 않는가
// 2. 다음 커밋에서 캔버스가 fallback으로 대체된 트리를 올바르게 반영하는가
// 를 실제로 확인한다 (ADR-0010). "복구" 버튼은 key를 바꿔 바운더리를 완전히 새 인스턴스로
// 리마운트한다 — getDerivedStateFromError로 들어간 상태는 setState만으로 되돌릴 수 없다.
interface BoundaryState {
  hasError: boolean;
}

class Boundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[fixture] ErrorBoundaryDemo가 에러를 잡음', error);
  }

  render() {
    if (this.state.hasError) {
      return <p>문제가 발생했습니다 (fallback).</p>;
    }
    return this.props.children;
  }
}

function Faulty({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('fixture: 의도된 렌더 에러');
  }
  return <span>정상 렌더 중</span>;
}

export function ErrorBoundaryDemo() {
  const [shouldThrow, setShouldThrow] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  return (
    <section>
      <h2>error boundary</h2>
      <Boundary key={resetKey}>
        <Faulty shouldThrow={shouldThrow} />
      </Boundary>
      <Button label="에러 유발" onClick={() => setShouldThrow(true)} />
      <Button
        label="복구"
        variant="ghost"
        onClick={() => {
          setShouldThrow(false);
          setResetKey((k) => k + 1);
        }}
      />
    </section>
  );
}
