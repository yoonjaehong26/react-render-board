// 라이브러리 공개 API (배포 준비, docs/project-status.md 7-3(b) / ADR-0023).
// 3-레이어 구조(docs/architecture.md) 중 이 파일이 노출하는 건 각 레이어의 진입점뿐이다 —
// 레이어 내부 구현(src/data/serialize.ts 등)은 여기서 재수출하지 않는다.
//
// 사용 예 (src/main.tsx가 실제로 이렇게 쓴다):
//   const store = createRenderStore();
//   const interactionStore = createInteractionStore();
//   startFiberInspector(store, subjectContainer);
//   startDomClickBridge(subjectContainer, interactionStore); // 역방향(DOM→보드) 인터랙션, 선택
//   createRoot(overlayHost).render(<BoardOverlay store={store} interactionStore={interactionStore} />);
//
// BoardOverlay/Canvas는 자체 CSS(@xyflow/react/dist/style.css + flow.css)에 의존한다.
// 라이브러리로 소비할 때는 별도로 CSS를 import해야 한다 — 이 엔트리는 JS/TSX만 다룬다.
export { createRenderStore } from './data/store';
export type { RenderStore, SnapshotListener } from './data/store';
export type { RenderNode, RenderSnapshot, FiberKind } from './data/types';

export { startFiberInspector } from './hooking/fiberInspector';
export { startDomClickBridge, findFiberIdForElement, resolveHostElements } from './hooking/domInteraction';

export { Canvas, type CanvasProps } from './visualization/Canvas';
export { BoardOverlay, type BoardOverlayProps } from './visualization/BoardOverlay';
export { DomHighlightOverlay } from './visualization/components/DomHighlightOverlay';
export { createInteractionStore } from './visualization/lib/interactionStore';
export type { InteractionStore, InteractionSnapshot, InteractionListener } from './visualization/lib/interactionStore';

// props 흐름 추적 + 변경 잔상 (ADR-0032). Canvas가 내부에서 자체 afterglowStore를 만들어 쓰므로
// 이 export는 필수는 아니고, 소비자가 커스텀 통합에서 잔상 상태를 직접 다룰 때를 위한 것이다.
export { createAfterglowStore } from './visualization/lib/afterglowStore';
export type { AfterglowStore, AfterglowListener } from './visualization/lib/afterglowStore';
export {
  readFiberProps,
  isTrackable,
  describeValue,
  fiberPropsChanged,
  representativeChangedProp,
  trackReferenceInDescendants,
} from './visualization/lib/propsFlow';
export type { PropRow, PropValueKind } from './visualization/lib/propsFlow';
