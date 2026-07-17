// roadmap.md의 "컴포넌트 수백~수천 개" 중 "수천" 규모가 실제 라이브 훅킹 파이프라인
// (fiberInspector -> serializeFiberTree -> RenderStore, ADR-0012)에서도 버티는지 검증하기
// 위한 합성 스트레스 fixture. count개의 실제(익명 아닌) composite Fiber를 마운트한다 —
// exp2의 generateLargeTree와 달리 이건 가짜 JSON이 아니라 진짜 React 컴포넌트라서
// serializeFiberTree가 매 커밋마다 훑는 실제 트리 크기를 그만큼 키운다.
//
// 한 부모 아래 count개를 전부 형제(sibling)로 flat하게 나열하지 않는다 — 이 스트레스
// 테스트 도중 실제로 발견한 병목(별도 ADR 기록 대상)인데, serializeFiberTree의 재귀
// 순회가 형제 하나를 넘어갈 때마다도 depth를 1 증가시켜, MAX_DEPTH(200)가 "트리 깊이"가
// 아니라 "한 부모 밑 형제 개수"에도 그대로 적용된다. 5,000개를 flat하게 렌더링하면 200번째
// 형제부터 조용히(console.warn만 남기고) 순회가 끊겨 나머지 ~4,800개가 시각화에서 사라진다.
// BRANCH(20)로 청크를 나눠 트리 형태로 재귀 렌더링하면 어느 레벨이든 형제 수가 20을
// 넘지 않아 이 문제를 피하면서 총 count는 그대로 유지한다.
const BRANCH = 20;

function StressLeaf({ index }: { index: number }) {
  return <div className="stress-leaf">{index}</div>;
}

function StressNode({ start, count }: { start: number; count: number }) {
  if (count <= BRANCH) {
    return (
      <div className="stress-node">
        {Array.from({ length: count }, (_, i) => (
          <StressLeaf key={start + i} index={start + i} />
        ))}
      </div>
    );
  }

  const chunkSize = Math.ceil(count / BRANCH);
  const chunks: { start: number; count: number }[] = [];
  let remaining = count;
  let cursor = start;
  while (remaining > 0) {
    const c = Math.min(chunkSize, remaining);
    chunks.push({ start: cursor, count: c });
    cursor += c;
    remaining -= c;
  }

  return (
    <div className="stress-node">
      {chunks.map((c) => (
        <StressNode key={c.start} start={c.start} count={c.count} />
      ))}
    </div>
  );
}

export function StressGrid({ count }: { count: number }) {
  return (
    <div className="stress-grid" data-testid="stress-grid">
      <StressNode start={0} count={count} />
    </div>
  );
}
