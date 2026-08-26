import type { PanelDock } from './panelLayoutPreference';

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export function panelRect(dock: PanelDock, sizeFraction: number, viewport: ViewportSize): ScreenRect {
  const side = Math.round(viewport.width * sizeFraction);
  const vertical = Math.round(viewport.height * sizeFraction);
  if (dock === 'left') return { left: 0, top: 0, width: side, height: viewport.height };
  if (dock === 'right') return { left: viewport.width - side, top: 0, width: side, height: viewport.height };
  if (dock === 'top') return { left: 0, top: 0, width: viewport.width, height: vertical };
  return { left: 0, top: viewport.height - vertical, width: viewport.width, height: vertical };
}

export function intersectionArea(a: ScreenRect, b: ScreenRect): number {
  const width = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return width * height;
}

/** 현재 위치를 tie-breaker로 써 자동 배치가 불필요하게 흔들리지 않게 한다. */
export function leastObstructiveDock(
  target: ScreenRect,
  currentDock: PanelDock,
  sizeFraction: number,
  viewport: ViewportSize,
): { dock: PanelDock; overlapRatio: number } {
  const targetArea = Math.max(1, target.width * target.height);
  const docks: PanelDock[] = ['left', 'right', 'top', 'bottom'];
  let winner = currentDock;
  let leastArea = Number.POSITIVE_INFINITY;
  for (const dock of docks) {
    const area = intersectionArea(target, panelRect(dock, sizeFraction, viewport));
    if (area < leastArea || (area === leastArea && dock === currentDock)) {
      winner = dock;
      leastArea = area;
    }
  }
  return { dock: winner, overlapRatio: leastArea / targetArea };
}

export function shouldUseFocusRail(target: ScreenRect, overlapRatio: number, viewport: ViewportSize): boolean {
  // 대형/전폭 영역은 어느 쪽에 도킹해도 일부가 가려진다. 이때만 캔버스를 얇은 레일로
  // 접어 실제 UI를 우선한다. 작은 요소는 반대편 도킹만으로 충분하다.
  return overlapRatio >= 0.18 || (target.width >= viewport.width * 0.75 && target.height >= viewport.height * 0.45);
}
