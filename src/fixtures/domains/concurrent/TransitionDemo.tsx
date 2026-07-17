import { useState, useTransition } from 'react';
import { Button } from '../shared/Button';

// useTransition/startTransition fixture. bippy onCommitFiberRoot는 커밋 시점에만 발화하므로
// (architecture.md 설계 원칙 3) transition의 "진행 중" 렌더 자체는 원래도 관찰 대상이 아니다 —
// 여기서 확인하려는 건 (1) isPending 구간 동안에도 캔버스가 이상한 중간 트리를 그리지 않는가,
// (2) transition이 끝난 뒤 커밋된 결과 트리가 온전한가다. 렌더를 의도적으로 무겁게 만들어야
// isPending=true 구간이 실제로 관찰 가능한 폭을 갖는다.
function expensiveRender(seed: number): number {
  let acc = 0;
  for (let i = 0; i < 3000; i++) acc += Math.sqrt(seed * i + 1);
  return acc;
}

function RowList({ count }: { count: number }) {
  const rows = Array.from({ length: count }, (_, i) => i);
  return (
    <ul>
      {rows.map((i) => (
        <li key={i}>
          row {i} ({expensiveRender(i).toFixed(2)})
        </li>
      ))}
    </ul>
  );
}

export function TransitionDemo() {
  const [count, setCount] = useState(30);
  const [isPending, startTransition] = useTransition();

  return (
    <section>
      <h2>transition ({isPending ? 'pending' : 'idle'})</h2>
      <Button
        label="목록 늘리기 (startTransition)"
        onClick={() => {
          startTransition(() => {
            setCount((c) => c + 500);
          });
        }}
      />
      <RowList count={count} />
    </section>
  );
}
