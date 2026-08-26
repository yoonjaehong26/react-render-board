import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { formatAiTarget, identifyAiTarget, type AiTarget } from '../../hooking/targetContext';
import { copyTextToClipboard } from '../lib/clipboard';
import type { BillboardPosition } from '../lib/billboardPreference';

export interface TargetBillboardProps {
  target: AiTarget;
  /** hover 중의 transient target은 미리보기만 하고, 복사는 고정 선택에서만 허용한다. */
  preview: boolean;
  onClear?: () => void;
  position?: BillboardPosition;
  onPositionChange?: (position: BillboardPosition) => void;
  onPositionCommit?: () => void;
}

// 화면 위 "전광판": Alt-hover에는 무엇을 고르게 되는지, Alt-click 뒤에는 AI에 복사할 정확한
// Fiber 경로를 한 줄로 보여준다. 대상 앱의 DOM/스타일에는 아무 표시도 남기지 않는 포탈 UI다.
export function TargetBillboard({ target, preview, onClear, position, onPositionChange, onPositionCommit }: TargetBillboardProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const elementRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startPosition: BillboardPosition } | null>(null);

  useEffect(() => {
    setCopyState('idle');
  }, [target, preview]);

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const updateSize = () => setSize({ width: element.offsetWidth, height: element.offsetHeight });
    updateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [target, preview]);

  const formattedTarget = formatAiTarget(target);
  const identification = identifyAiTarget(target);

  async function copyTarget() {
    try {
      await copyTextToClipboard(`Target: ${formattedTarget}`);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  const range = {
    x: Math.max(0, viewport.width - size.width - 32),
    y: Math.max(0, viewport.height - size.height - 32),
  };
  const positionedStyle: CSSProperties | undefined = position && size.width > 0
    ? {
        left: 16 + range.x * position.x,
        top: 16 + range.y * position.y,
        transform: 'none',
      }
    : undefined;

  function onDragStart(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!position || !onPositionChange || event.button !== 0) return;
    event.preventDefault();
    // jsdom과 일부 임베디드 브라우저는 Pointer Events는 내보내지만 capture 메서드는
    // 구현하지 않는다. capture 없이도 같은 핸들 안 드래그는 계속 계산할 수 있다.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startPosition: position };
  }

  function onDragMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !onPositionChange) return;
    event.preventDefault();
    onPositionChange({
      x: range.x === 0 ? 0 : Math.min(1, Math.max(0, drag.startPosition.x + (event.clientX - drag.startX) / range.x)),
      y: range.y === 0 ? 0 : Math.min(1, Math.max(0, drag.startPosition.y + (event.clientY - drag.startY) / range.y)),
    });
  }

  function onDragEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    onPositionCommit?.();
  }

  return (
    <aside ref={elementRef} className={`target-billboard${preview ? ' target-billboard--preview' : ''}`} style={positionedStyle} aria-live="polite">
      <div className="target-billboard__heading">
        <div className="target-billboard__eyebrow">{preview ? '요소 미리보기' : '선택한 요소'}</div>
        {!preview && onPositionChange && (
          <button
            type="button"
            className="target-billboard__drag"
            aria-label="전광판 위치 이동"
            title="드래그해 전광판 위치 이동"
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
          >
            ⠿
          </button>
        )}
      </div>
      <div className="target-billboard__target" title={formattedTarget}>
        {formattedTarget}
      </div>
      {identification.level !== 'clear' && (
        <div className={`target-billboard__identification target-billboard__identification--${identification.level}`}>
          <strong>{identification.level === 'ambiguous' ? '식별 불충분' : '식별 보조'}</strong>
          <span>{identification.reason}</span>
        </div>
      )}
      {preview ? (
        <div className="target-billboard__hint">클릭해 고정</div>
      ) : (
        <div className="target-billboard__actions">
          <button type="button" className="target-billboard__copy" onClick={copyTarget}>
            {copyState === 'copied' ? '복사됨' : copyState === 'failed' ? '복사 실패' : 'AI용 복사'}
          </button>
          {onClear && (
            <button type="button" className="target-billboard__clear" onClick={onClear} aria-label="선택한 요소 닫기">
              ×
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
