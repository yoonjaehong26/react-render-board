import { Component } from 'react';
import { Button } from '../shared/Button';

// class 컴포넌트(React.Component 상속) fixture. src/data/serialize.ts의 classify()는
// bippy isCompositeFiber(tag 기반, ClassComponentTag=1 포함)로 판단하므로 이론상
// FunctionComponent와 다르게 취급되지 않는다 — 실제 Fiber 순회/직렬화와 groupHint
// (ADR-0007의 getSource)가 정말 그렇게 동작하는지 실제 커밋으로 확인한다 (ADR-0010).
interface ClassCounterState {
  count: number;
}

export class ClassCounter extends Component<Record<string, never>, ClassCounterState> {
  state: ClassCounterState = { count: 0 };

  handleIncrement = () => {
    this.setState((prev) => ({ count: prev.count + 1 }));
  };

  render() {
    return (
      <div>
        <span>class count: {this.state.count}</span>
        <Button label="class 증가" onClick={this.handleIncrement} />
      </div>
    );
  }
}
