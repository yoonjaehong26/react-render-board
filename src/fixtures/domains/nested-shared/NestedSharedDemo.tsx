// 자식 있는 공유 컨테이너 재현(증분2 검증). SharedCard(→CardBody 렌더)를 CardUserA/CardUserB
// 두 파일에서 씀 → SharedCard.tsx가 다중 부모 + 자식(CardBody.tsx)을 동시에 갖는다. 레인에
// SharedCard + CardBody가 미니 트리(SharedCard 위, CardBody 아래)로 함께 놓이는지 확인한다.
import { CardUserA } from './CardUserA';
import { CardUserB } from './CardUserB';

export function NestedSharedDemo() {
  return (
    <section>
      <h2>nested shared</h2>
      <CardUserA />
      <CardUserB />
    </section>
  );
}
