// 자식 있는 공유 컨테이너(증분2). 자식 CardBody를 **다른 파일**에서 렌더하므로 CardBody.tsx가
// 별도 그룹(cross-group 자식)이 되고, 이 SharedCard를 여러 파일이 쓰면 SharedCard.tsx 그룹이
// **다중 부모 + 자식 그룹**을 동시에 갖는다 → 레인에 SharedCard + CardBody가 미니 트리로 놓인다.
import type { ReactNode } from 'react';
import { CardBody } from './CardBody';

export function SharedCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="demo-card">
      <header>{title}</header>
      <CardBody />
      <div>{children}</div>
    </section>
  );
}
