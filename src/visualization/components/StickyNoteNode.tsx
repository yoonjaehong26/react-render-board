import type { NodeProps } from '@xyflow/react';

export interface StickyNoteNodeData extends Record<string, unknown> {
  text: string;
  onTextChange: (text: string) => void;
  onDelete: () => void;
}

// 캔버스 스티키노트(ADR-0029) — RenderNode 데이터와 무관한 순수 UI 주석. group/component
// 노드와 달리 draggable:true라 사용자가 자유롭게 옮길 수 있다(Canvas.tsx의 onNodesChange가
// 위치 변경을 stickyNotes state로 반영한다).
export function StickyNoteNode({ data }: NodeProps) {
  const { text, onTextChange, onDelete } = data as StickyNoteNodeData;

  return (
    <div className="sticky-note">
      <button type="button" className="sticky-note__delete nodrag" onClick={onDelete} aria-label="메모 삭제">
        ×
      </button>
      {/* nodrag/nopan/nowheel: textarea 안에서 텍스트를 선택/스크롤해도 캔버스 팬/줌으로 새지
          않게 한다(연구 문서가 확인한 xyflow 공식 관례) — 노드 자체는 draggable이라 헤더/
          여백을 드래그하면 여전히 옮겨진다. */}
      <textarea
        className="sticky-note__text nodrag nopan nowheel"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="메모…"
      />
    </div>
  );
}
