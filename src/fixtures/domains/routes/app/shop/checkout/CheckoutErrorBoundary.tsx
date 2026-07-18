import { Component, type ReactNode } from 'react';

// 에러 바운더리 표식(🛡, ADR-0028)의 트리거 — 결제 위젯이 렌더 중 던지면 여기서 잡아 fallback을
// 보여준다. resilience/ErrorBoundaryDemo.tsx와 같은 패턴을 쇼핑 맥락(결제)에 둔 것.
interface State {
  hasError: boolean;
}

export class CheckoutErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[fixture] CheckoutErrorBoundary가 결제 에러를 잡음', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="checkout-fallback">
          <p>결제 중 문제가 발생했습니다.</p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onReset();
            }}
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
