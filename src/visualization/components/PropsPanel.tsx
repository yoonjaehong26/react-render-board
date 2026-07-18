// 노드 선택 시 뜨는 props 패널(ADR-0032 1층). 태그 구름 칩이 아니라 "우선순위 정렬 스크롤
// 리스트"다(ADR-0032가 기각한 대안): 변경된 prop을 맨 위, 추적 가능(객체/콜백)을 그 다음,
// primitive를 아래로 흐리게. 정렬/미리보기/추적 가능 판정은 전부 propsFlow.ts가 끝냈고 이
// 컴포넌트는 그리기만 한다. 값은 얕은 미리보기만(깊은 직렬화 안 함).
//
// 추적 가능 행을 클릭하면 그 prop의 참조를 자손 트리에서 추적한다(ADR-0032 3층) — 새 간선
// 없이 기존 트리의 서브체인을 하이라이트하는 것이므로, 클릭은 Canvas의 trackedIds 상태만 바꾼다.
//
// 위치·크기: 캔버스를 자유롭게 떠다니는 창이라 헤더 드래그로 옮기고 좌하단 핸들로 크기를 바꾼다
// (ADR-0051). props가 많아지면 넓게/길게 늘려 볼 수 있어야 해서다. 좌표/크기는 컨테이너
// (.canvas) 기준으로 계산하고 localStorage에 기억한다(propsPanelPreference.ts).
import { useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PropRow } from '../lib/propsFlow';
import {
  clampLayout,
  defaultLayout,
  getStoredPropsPanelLayout,
  setStoredPropsPanelLayout,
  type PropsPanelLayout,
} from '../lib/propsPanelPreference';

export interface PropsPanelProps {
  displayName: string;
  rows: PropRow[];
  /** 지금 참조 추적 중인 prop 키(없으면 null). 해당 행에 "추적 중" 배지를 붙인다. */
  trackedKey: string | null;
  /** 추적 가능 행 클릭 시(같은 키 다시 누르면 해제하는 토글은 Canvas가 처리). */
  onTrackProp: (row: PropRow) => void;
  onClose: () => void;
}

/** 드래그/리사이즈 시작 시점의 스냅샷(포인터 좌표 + 그 순간의 레이아웃). */
interface DragState {
  mode: 'move' | 'resize';
  pointerX: number;
  pointerY: number;
  start: PropsPanelLayout;
}

export function PropsPanel({ displayName, rows, trackedKey, onTrackProp, onClose }: PropsPanelProps) {
  const asideRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // 마운트 전엔 null → 기존 CSS 기본 위치(우측 세로 꽉 참)로 그려지고, useLayoutEffect가
  // 컨테이너 크기를 재서 저장값(또는 기본값)을 clamp해 확정한다.
  const [layout, setLayout] = useState<PropsPanelLayout | null>(null);

  function container() {
    return asideRef.current?.parentElement ?? null;
  }

  useLayoutEffect(() => {
    const el = container();
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const stored = getStoredPropsPanelLayout();
    setLayout(clampLayout(stored ?? defaultLayout(cw, ch), cw, ch));
  }, []);

  function onPointerMove(e: PointerEvent) {
    const drag = dragRef.current;
    const el = container();
    if (!drag || !el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const dx = e.clientX - drag.pointerX;
    const dy = e.clientY - drag.pointerY;
    if (drag.mode === 'move') {
      setLayout(clampLayout({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy }, cw, ch));
    } else {
      // 좌하단(SW) 핸들: 오른쪽 변은 고정, 왼쪽 변이 이동(width는 왼쪽으로 커지고 x가 따라감),
      // 아래 변이 이동(height). 우측 도킹 기본 위치에서 자연스럽게 안쪽으로 넓힌다.
      const right = drag.start.x + drag.start.width;
      const width = drag.start.width - dx;
      const height = drag.start.height + dy;
      setLayout(clampLayout({ x: right - width, y: drag.start.y, width, height }, cw, ch));
    }
  }

  function endDrag() {
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    setLayout((current) => {
      if (current) setStoredPropsPanelLayout(current);
      return current;
    });
  }

  function beginDrag(mode: DragState['mode'], e: ReactPointerEvent) {
    if (e.button !== 0 || !layout) return;
    e.preventDefault();
    dragRef.current = { mode, pointerX: e.clientX, pointerY: e.clientY, start: layout };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
  }

  function onHeaderPointerDown(e: ReactPointerEvent) {
    // 닫기 버튼 클릭은 드래그로 삼키지 않는다.
    if ((e.target as HTMLElement).closest('.props-panel__close')) return;
    beginDrag('move', e);
  }

  const style =
    layout === null
      ? undefined
      : { left: layout.x, top: layout.y, width: layout.width, height: layout.height, right: 'auto', bottom: 'auto' };

  return (
    <aside ref={asideRef} className="props-panel" role="complementary" aria-label="props 패널" style={style}>
      <header className="props-panel__header props-panel__header--draggable" onPointerDown={onHeaderPointerDown}>
        <span className="props-panel__grip" aria-hidden="true">
          ⠿
        </span>
        <span className="props-panel__title" title={displayName}>
          {displayName}
        </span>
        <button type="button" className="props-panel__close" onClick={onClose} aria-label="props 패널 닫기">
          ✕
        </button>
      </header>

      {rows.length === 0 ? (
        <p className="props-panel__empty">표시할 props가 없습니다</p>
      ) : (
        <ul className="props-panel__list">
          {rows.map((row) => {
            const classes = ['props-row', `props-row--${row.kind}`];
            if (!row.trackable) classes.push('props-row--untrackable');
            if (row.changed) classes.push('props-row--changed');
            if (row.key === trackedKey) classes.push('props-row--tracked');
            return (
              <li key={row.key}>
                <button
                  type="button"
                  className={classes.join(' ')}
                  disabled={!row.trackable}
                  onClick={() => row.trackable && onTrackProp(row)}
                  title={row.trackable ? '이 prop의 참조를 자손 트리에서 추적' : '추적 불가 (primitive/element)'}
                >
                  <span className="props-row__key">{row.key}</span>
                  <span className="props-row__value">{row.preview}</span>
                  {row.changed && <span className="props-row__badge props-row__badge--changed">변경됨</span>}
                  {row.key === trackedKey && (
                    <span className="props-row__badge props-row__badge--tracked">추적 중</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {trackedKey && (
        <footer className="props-panel__footer">
          자손 트리에서 <code>{trackedKey}</code>와 같은 참조를 강조 중
        </footer>
      )}

      <div
        className="props-panel__resize"
        onPointerDown={(e) => beginDrag('resize', e)}
        role="presentation"
        aria-hidden="true"
        title="크기 조절"
      />
    </aside>
  );
}
