import { useEffect, useRef, useState, type WheelEvent } from 'react';
import type { NodeProps } from '@xyflow/react';

export interface StickyNoteNodeData extends Record<string, unknown> {
  text: string;
  onTextChange: (text: string) => void;
  onDelete: () => void;
}

// 부모 state(stickyNotes)로 매 타이핑마다 즉시 반영하지 않고 잠시 멈췄을 때만 반영한다 —
// 부모로의 즉시 반영은 BoardContent 재렌더를 유발해(다른 고빈도 갱신과 겹치면 더 자주) 그
// 재렌더가 이 textarea에 controlled value를 다시 밀어넣고, 그 시점이 한글 조합 도중이면
// 조합이 깨져 자음/모음이 따로 찍힌다.
const SYNC_DEBOUNCE_MS = 300;

// 캔버스 스티키노트(ADR-0029) — RenderNode 데이터와 무관한 순수 UI 주석. group/component
// 노드와 달리 draggable:true라 사용자가 자유롭게 옮길 수 있다(Canvas.tsx의 onNodesChange가
// 위치 변경을 stickyNotes state로 반영한다).
export function StickyNoteNode({ data }: NodeProps) {
  const { text: persistedText, onTextChange, onDelete } = data as StickyNoteNodeData;
  // 로컬 버퍼: 타이핑은 이 state로만 즉시 반영해 controlled textarea가 항상 "지금 친 값"과
  // 일치하게 하고, 부모 동기화는 디바운스로 늦춰 재렌더 빈도를 낮춘다(위 주석). 마운트 이후엔
  // persistedText를 되읽지 않는다 — 이 노트의 텍스트를 바꾸는 유일한 주체가 이 컴포넌트라
  // 외부에서 값이 바뀔 일이 없다(드래그로 위치만 바뀌는 stickyNotes 갱신은 text가 그대로다).
  const [localText, setLocalText] = useState(persistedText);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setLocalText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      onTextChange(value);
    }, SYNC_DEBOUNCE_MS);
  };

  const flushNow = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onTextChange(localText);
  };

  // nowheel 전체 차단 대신 "이 textarea가 그 방향으로 더 스크롤할 여지가 있을 때만" 캔버스로의
  // 전파를 막는다(scroll chaining) — 짧은 메모는 스크롤할 내용이 없어 그대로 캔버스 줌으로
  // 새 나가고, 긴 메모는 끝까지 스크롤한 뒤에야 줌으로 넘어간다.
  const handleWheel = (e: WheelEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const canScrollUp = el.scrollTop > 0;
    const canScrollDown = el.scrollTop + el.clientHeight < el.scrollHeight;
    if ((e.deltaY < 0 && canScrollUp) || (e.deltaY > 0 && canScrollDown)) {
      e.stopPropagation();
    }
  };

  return (
    <div className="sticky-note">
      <button type="button" className="sticky-note__delete nodrag" onClick={onDelete} aria-label="메모 삭제">
        ×
      </button>
      {/* nodrag/nopan: textarea 안에서 텍스트를 선택해도 캔버스 팬/드래그로 새지 않게 한다
          (연구 문서가 확인한 xyflow 공식 관례) — 노드 자체는 draggable이라 헤더/여백을 드래그하면
          여전히 옮겨진다. wheel은 nowheel 대신 handleWheel로 선택적으로만 막는다(위 주석). */}
      <textarea
        className="sticky-note__text nodrag nopan"
        value={localText}
        onChange={handleChange}
        onBlur={flushNow}
        onWheel={handleWheel}
        placeholder="메모…"
      />
    </div>
  );
}
