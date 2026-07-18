// 공유 "컨테이너" fixture — 공유 UI 레인 설계 검증용
// (research/2026-07-18-stable-skeleton-shared-ui-lane.md).
//
// 공유 리프(Button)는 host만 렌더해 자기 그룹을 안 만든다 → 여러 곳에 써도 다중 부모가 안 생긴다.
// 반면 Dialog는 자기 서브컴포넌트(DialogHeader/DialogBody)를 렌더하므로 그 JSX가 쓰인 파일
// (=Dialog.tsx)이 하나의 그룹이 된다. 이 Dialog를 서로 다른 두 파일(SettingsDialog/ProfileDialog)에서
// 쓰면 Dialog.tsx 그룹이 부모를 둘 갖는 "다중 부모 그룹"이 된다 — tidy-tree(순수 트리)를 DAG로 만드는
// 유일한 케이스이자, 공유 UI 레인이 겨냥하는 바로 그 구조. 지금까지 fixture는 순수 트리라 이 구조를
// 도구에서 한 번도 재현한 적이 없었다(설계가 이론뿐이었음). 이 fixture가 그 전제를 실증한다.
import type { ReactNode } from 'react';

function DialogHeader({ title }: { title: string }) {
  return <header className="demo-dialog__header">{title}</header>;
}

function DialogBody({ children }: { children: ReactNode }) {
  return <div className="demo-dialog__body">{children}</div>;
}

export function Dialog({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="demo-dialog">
      <DialogHeader title={title} />
      <DialogBody>{children}</DialogBody>
    </section>
  );
}
