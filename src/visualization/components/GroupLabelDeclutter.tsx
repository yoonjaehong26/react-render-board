import { useEffect, useMemo } from 'react';
import { useStore } from '@xyflow/react';
import { chooseVisibleLabelIds, type LabelCandidate } from '../lib/labelDeclutter';
import { MAP_MODE_THRESHOLD } from './SemanticZoomController';

interface GroupLabelDeclutterProps {
  targetRef: React.RefObject<HTMLDivElement | null>;
  /** 검색/DOM 선택/prop 추적이 가리키는 그룹 id 목록. 내용이 그대로면 live commit에도 effect를 다시 돌리지 않는다. */
  pinnedGroupKey: string;
  /** 렌더된 그룹 구성이 바뀌었음을 알리는 안정된 키. */
  labelsVersion: string;
}

/**
 * counter-scale된 그룹 라벨의 충돌을 캔버스 DOM에서 직접 해소한다.
 *
 * React state로 각 라벨의 visible 여부를 내리면 줌 중 수십~수백 GroupNode가 다시 렌더되어
 * 지도 모드의 성능 계약(React Flow에 주는 배열을 작게 유지)을 해친다. 이 컴포넌트만 zoom을
 * 구독하고, rAF 뒤 실제 픽셀 rect를 읽어 헤더 class/aria-hidden만 바꾼다.
 */
export function GroupLabelDeclutter({ targetRef, pinnedGroupKey, labelsVersion }: GroupLabelDeclutterProps) {
  const zoom = useStore((s) => s.transform[2]);
  const isMapMode = zoom < MAP_MODE_THRESHOLD;
  const pinnedGroupIds = useMemo(
    () => new Set(pinnedGroupKey ? pinnedGroupKey.split('\u0001') : []),
    [pinnedGroupKey],
  );

  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      const root = targetRef.current;
      if (!root) return;
      const headers = Array.from(root.querySelectorAll<HTMLElement>('[data-declutter-header]'));

      const show = (header: HTMLElement) => {
        header.classList.remove('group-node__header--decluttered');
        header.removeAttribute('aria-hidden');
      };

      // 상세 모드로 돌아오면 한 번에 원상복구한다. DOM에 이미 없는 화면 밖 그룹에는 손댈 필요가 없다.
      if (!isMapMode) {
        headers.forEach(show);
        return;
      }

      const candidates: LabelCandidate[] = [];
      for (const header of headers) {
        // 지난 pass에서 숨긴 것이 rect 0으로 이어지지 않도록 먼저 보이게 복구하고 측정한다.
        show(header);
        const rect = header.querySelector<HTMLElement>('.group-node__label')?.getBoundingClientRect();
        const id = header.dataset.declutterId;
        if (!rect || !id || rect.width <= 0 || rect.height <= 0) continue;
        candidates.push({
          id,
          rect,
          pinned: pinnedGroupIds.has(id),
          priority: Number(header.dataset.declutterPriority) || 0,
        });
      }

      const visible = chooseVisibleLabelIds(candidates);
      for (const header of headers) {
        const id = header.dataset.declutterId;
        if (id && !visible.has(id)) {
          header.classList.add('group-node__header--decluttered');
          header.setAttribute('aria-hidden', 'true');
        }
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [isMapMode, labelsVersion, pinnedGroupIds, targetRef, zoom]);

  return null;
}
