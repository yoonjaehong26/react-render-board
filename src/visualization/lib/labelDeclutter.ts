/** 화면 좌표에서 라벨끼리 겹치는지 판정하는 최소 사각형. 월드 좌표가 아니라
 * getBoundingClientRect() 결과를 넣는다 — counter-scale된 라벨의 실제 화면 크기와 같아야
 * semantic zoom의 충돌을 정확히 판단할 수 있다. */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LabelCandidate {
  id: string;
  rect: ScreenRect;
  /** 검색/선택/추적처럼 사용자가 지금 찾고 있는 그룹은 충돌해도 절대 숨기지 않는다. */
  pinned: boolean;
  /** 같은 위치에서 하나만 남겨야 하면 큰 그룹을 대표로 남긴다. */
  priority: number;
}

/**
 * 지도 모드의 라벨을 screen-space에서 greedy하게 솎는다.
 *
 * 월드 좌표 거리로 판단하면 zoom과 counter-scale 때문에 실제 화면에서의 충돌을 놓친다.
 * pinned 라벨은 모두 남기고(검색은 언제나 이긴다), 나머지는 그룹 크기 우선으로 하나씩
 * 채택한다. 같은 priority일 때 id를 비교해 live commit마다 결과가 흔들리지 않게 한다.
 */
export function chooseVisibleLabelIds(candidates: readonly LabelCandidate[], gap = 4): Set<string> {
  const visible = new Set<string>();
  const occupied: ScreenRect[] = [];

  const ordered = [...candidates].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });

  for (const candidate of ordered) {
    // 검색/선택 결과는 충돌해도 보존한다. 다만 이후의 일반 라벨을 막는 영역으로는 쓴다.
    if (candidate.pinned || !occupied.some((rect) => rectsOverlap(candidate.rect, rect, gap))) {
      visible.add(candidate.id);
      occupied.push(candidate.rect);
    }
  }

  return visible;
}

function rectsOverlap(a: ScreenRect, b: ScreenRect, gap: number): boolean {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
}
