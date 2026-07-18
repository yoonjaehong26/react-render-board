import { useEffect, useState } from 'react';

// props 흐름 데모 fixture 2종(ADR-0032). DataFlowPanel(1.5초 간격)과 달리 두 가지 다른 리듬/원인을
// 보여준다.

// (1) 느린 props 상속 — 5초마다 새 객체를 내려보낸다. DataFlowPanel(1.5초)은 흐름이 식기 전에
//     재점화돼 색이 계속 뜨거운데, 이건 간격이 넉넉해서 흐름이 "시작 → 빨강→파랑으로 식음 →
//     소멸"하는 한 사이클을 눈으로 볼 수 있다(잔상 half-life ~5초와 맞물림).
const SLOW_MS = 5000;

interface SlowConfig {
  version: number;
  tone: number;
}

export function SlowFlowPanel() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setVersion((v) => v + 1), SLOW_MS);
    return () => clearInterval(id);
  }, []);
  const config: SlowConfig = { version, tone: (version * 47) % 360 };
  return (
    <section className="slowflow-panel">
      <h2>slow flow ({SLOW_MS / 1000}s 간격 props 상속)</h2>
      <p>
        간격이 넉넉해 흐름이 <strong>시작→식음→소멸</strong>하는 한 사이클이 보인다. 흐름을 켜고
        SlowBranch를 지켜보라.
      </p>
      <SlowBranch config={config} />
    </section>
  );
}

function SlowBranch({ config }: { config: SlowConfig }) {
  return (
    <div className="slowflow-branch">
      <SlowLeaf config={config} label="A" />
      <SlowLeaf config={config} label="B" />
    </div>
  );
}

function SlowLeaf({ config, label }: { config: SlowConfig; label: string }) {
  return (
    <span className="slowflow-leaf" style={{ borderBottom: `3px solid hsl(${config.tone} 70% 50%)` }}>
      {label}: tone {config.tone}
    </span>
  );
}

// (2) 내부 상태 변화 — 이 컴포넌트는 "부모에서 받는 props"가 아니라 "자기 useState"로 리렌더된다.
//     흐름은 prop 변경만 잡으므로(우리 스코프, ADR-0032) 이 노드 자체는 흐름에 안 잡힌다. 하지만
//     자기 state에서 파생한 값을 자식에게 내려보내므로 그 자식(StateReadout)의 props는 바뀌고,
//     따라서 자식은 흐름에 잡힌다 — "내부 상태 변화는 자식으로의 props 흐름으로 드러난다"를 보여준다.
const INTERNAL_MS = 2000;

export function InternalStatePanel() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), INTERNAL_MS);
    return () => clearInterval(id);
  }, []);
  return (
    <section className="internalstate-panel">
      <h2>internal state (자기 state → 자식 props)</h2>
      <p>
        이 패널은 <strong>props 없이 자기 state</strong>로 {INTERNAL_MS / 1000}s마다 리렌더된다 — 흐름에
        안 잡힌다. 대신 그 state를 받는 <strong>StateReadout(자식)</strong>은 props가 바뀌어 흐름에 잡힌다.
      </p>
      <StateReadout snapshot={{ tick, at: tick * INTERNAL_MS }} />
    </section>
  );
}

function StateReadout({ snapshot }: { snapshot: { tick: number; at: number } }) {
  return (
    <span className="internalstate-readout">
      tick {snapshot.tick} · {(snapshot.at / 1000).toFixed(0)}s
    </span>
  );
}
