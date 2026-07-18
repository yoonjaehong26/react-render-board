import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../shared/Button';

// 포탈 fixture — 모달 내용이 createPortal로 document.body에 순간이동해 렌더된다. 리액트
// 컴포넌트 트리에서는 이 컴포넌트의 자식이지만, 실제 DOM에서는 부모(section) 밖 body에 붙는다.
// 도형 어휘의 "포탈 표식"(ADR-0028)이 감지·표시할 대상이라 실측/시연용으로 둔다.
function ModalContents() {
  return (
    <div className="portal-modal" role="dialog" aria-label="포탈 모달">
      <h3>포탈 모달</h3>
      <p>이 내용은 document.body로 순간이동해 렌더된다.</p>
    </div>
  );
}

export function PortalModal() {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <h2>portal</h2>
      <Button label={open ? '모달 닫기' : '모달 열기'} onClick={() => setOpen((v) => !v)} />
      {open && createPortal(<ModalContents />, document.body)}
    </section>
  );
}
