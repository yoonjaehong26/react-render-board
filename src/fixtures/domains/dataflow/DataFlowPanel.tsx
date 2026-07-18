import { useCallback, useEffect, useState } from 'react';

// props 흐름 추적 + 변경 잔상(ADR-0032) 데모용 fixture.
//
// 기존 fixture들은 대부분 정적 primitive prop만 넘겨서(예: CheckoutItem은 label 하나) props
// 패널·참조 추적·변경 잔상이 눈에 안 띄었다. 여기서는 같은 객체 참조(`data`)를 여러 컴포넌트
// 단계(List → Row → Badge)로 drilling하고, 그 객체를 주기적으로 "새 객체"로 교체한다. 덕분에
// 보드에서 노드를 클릭하기만 하면:
//   - `data`(객체) 행이 우선순위 정렬로 위에 오고, 갱신 때마다 "변경됨" 배지가 뜬다(b1)
//   - `data` 행을 클릭하면 그 참조를 물려받은 자손 노드들과 **그 사이 간선**이 강조된다(참조 추적)
//   - 잔상을 켜면 갱신 때마다 그 노드들이 발광한다
// 를 전부 한 번에 볼 수 있다.
const REFRESH_MS = 1500;

interface FlowData {
  version: number;
  label: string;
  hue: number;
}

export function DataFlowPanel() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setVersion((v) => v + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // 매 갱신마다 "새 객체 참조"다 — 참조가 바뀌므로 이 객체를 받는 모든 자손의 props가 바뀐다(b1:
  // memoizedProps vs alternate). 그래서 변경 감지/잔상이 이 서브트리 전체에서 발동한다.
  const data: FlowData = { version, label: `payload #${version}`, hue: (version * 40) % 360 };
  // 안정된 콜백 — data와 달리 참조가 안 바뀐다. "변하진 않지만 추적은 되는" 대비 예시.
  const onPick = useCallback(() => {}, []);

  return (
    <section className="dataflow-panel">
      <h2>data flow (props drilling 데모)</h2>
      <p>
        같은 <code>data</code> 객체가 {REFRESH_MS / 1000}s마다 새로 만들어져 아래로 흐른다. 보드에서{' '}
        <strong>DataFlowList</strong>나 <strong>DataFlowRow</strong>를 클릭 → props 패널에서{' '}
        <code>data</code> 행을 눌러 보라.
      </p>
      <DataFlowList data={data} onPick={onPick} />
    </section>
  );
}

function DataFlowList({ data, onPick }: { data: FlowData; onPick: () => void }) {
  return (
    <ul className="dataflow-list">
      {[0, 1, 2].map((i) => (
        <DataFlowRow key={i} data={data} onPick={onPick} index={i} />
      ))}
    </ul>
  );
}

function DataFlowRow({ data, onPick, index }: { data: FlowData; onPick: () => void; index: number }) {
  return (
    <li>
      <button type="button" onClick={onPick} style={{ borderLeft: `4px solid hsl(${data.hue} 70% 50%)` }}>
        row {index}
      </button>
      <DataFlowBadge data={data} />
    </li>
  );
}

function DataFlowBadge({ data }: { data: FlowData }) {
  return <span className="dataflow-badge">{data.label}</span>;
}
