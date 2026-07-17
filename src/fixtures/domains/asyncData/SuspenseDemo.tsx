import { Suspense, useState, use } from 'react';
import { Button } from '../shared/Button';

// Suspense(use() 기반 데이터 페칭) fixture. bippy 태그 분류상 SuspenseComponent(13)와
// OffscreenComponent(22)는 host도 composite도 아니라서 serialize.ts의 classify()가 이 둘을
// 노드로 만들지 않고 자식을 조상에 재연결한다 — 대기 중(fallback)과 resolve 후 커밋에서
// 이 구조가 실제로 깨지지 않는지, 재-suspend(다시 로드) 시에도 캔버스가 정상 갱신되는지
// 확인한다 (ADR-0010).
interface Resource {
  promise: Promise<string>;
}

function createResource(delayMs: number): Resource {
  return {
    promise: new Promise((resolve) => {
      setTimeout(() => resolve(`${delayMs}ms 후 로드된 데이터`), delayMs);
    }),
  };
}

function AsyncPanel({ resource }: { resource: Resource }) {
  const data = use(resource.promise);
  return <span>{data}</span>;
}

export function SuspenseDemo() {
  const [resource, setResource] = useState(() => createResource(500));

  return (
    <section>
      <h2>suspense</h2>
      <Suspense fallback={<span>로딩 중…</span>}>
        <AsyncPanel resource={resource} />
      </Suspense>
      <Button label="다시 로드" onClick={() => setResource(createResource(500))} />
    </section>
  );
}
