// 노드 선택 시 뜨는 props 패널(ADR-0032 1층). 태그 구름 칩이 아니라 "우선순위 정렬 스크롤
// 리스트"다(ADR-0032가 기각한 대안): 변경된 prop을 맨 위, 추적 가능(객체/콜백)을 그 다음,
// primitive를 아래로 흐리게. 정렬/미리보기/추적 가능 판정은 전부 propsFlow.ts가 끝냈고 이
// 컴포넌트는 그리기만 한다. 값은 얕은 미리보기만(깊은 직렬화 안 함).
//
// 추적 가능 행을 클릭하면 그 prop의 참조를 자손 트리에서 추적한다(ADR-0032 3층) — 새 간선
// 없이 기존 트리의 서브체인을 하이라이트하는 것이므로, 클릭은 Canvas의 trackedIds 상태만 바꾼다.
import type { PropRow } from '../lib/propsFlow';

export interface PropsPanelProps {
  displayName: string;
  rows: PropRow[];
  /** 지금 참조 추적 중인 prop 키(없으면 null). 해당 행에 "추적 중" 배지를 붙인다. */
  trackedKey: string | null;
  /** 추적 가능 행 클릭 시(같은 키 다시 누르면 해제하는 토글은 Canvas가 처리). */
  onTrackProp: (row: PropRow) => void;
  onClose: () => void;
}

export function PropsPanel({ displayName, rows, trackedKey, onTrackProp, onClose }: PropsPanelProps) {
  return (
    <aside className="props-panel" role="complementary" aria-label="props 패널">
      <header className="props-panel__header">
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
    </aside>
  );
}
