import { useEffect, useState } from 'react';
import { formatAiTarget, identifyAiTarget, type AiTarget } from '../../hooking/targetContext';
import { copyTextToClipboard } from '../lib/clipboard';

export interface TargetBillboardProps {
  target: AiTarget;
  /** hover 중의 transient target은 미리보기만 하고, 복사는 고정 선택에서만 허용한다. */
  preview: boolean;
  onClear?: () => void;
}

// 화면 위 "전광판": Alt-hover에는 무엇을 고르게 되는지, Alt-click 뒤에는 AI에 복사할 정확한
// Fiber 경로를 한 줄로 보여준다. 대상 앱의 DOM/스타일에는 아무 표시도 남기지 않는 포탈 UI다.
export function TargetBillboard({ target, preview, onClear }: TargetBillboardProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    setCopyState('idle');
  }, [target, preview]);

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

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

  return (
    <aside className={`target-billboard${preview ? ' target-billboard--preview' : ''}`} aria-live="polite">
      <div className="target-billboard__eyebrow">{preview ? '요소 미리보기' : '선택한 요소'}</div>
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
