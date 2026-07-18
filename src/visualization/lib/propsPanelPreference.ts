// props 패널(ADR-0032)의 위치·크기를 localStorage에 기억한다(ADR-0051). 도킹 패널
// (panelLayoutPreference.ts)과 달리 props 패널은 캔버스 위를 자유롭게 떠다니는 창이라
// 도킹 방향이 아니라 좌표(x,y)+크기(w,h)를 직접 저장한다. 좌표는 .canvas 컨테이너 기준 px.
//
// 창 크기가 달라지면 저장된 좌표가 화면 밖으로 나갈 수 있으므로, 불러온 뒤 항상 컨테이너
// 범위로 clamp한다(clampLayout). 저장이 아직 없으면 null을 돌려주고, 이때 호출부가 "우측
// 정렬" 기본값을 컨테이너 크기에서 계산한다 — 기본값을 여기서 만들면 컨테이너 크기를 몰라서다.
// colorModePreference.ts와 같은 "가장 얇은 get/set + try/catch" 패턴을 따른다.
const STORAGE_KEY = 'rrb:propsPanelLayout';

export interface PropsPanelLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_PANEL_WIDTH = 220;
export const MIN_PANEL_HEIGHT = 140;
/** 컨테이너 가장자리와의 최소 여백(기본 우측 정렬에도 쓰인다). */
export const PANEL_MARGIN = 12;

/** 저장된 크기/좌표를 컨테이너 범위 안으로 죈다. 최소 크기 보장 + 화면 밖 방지. */
export function clampLayout(
  layout: PropsPanelLayout,
  containerWidth: number,
  containerHeight: number,
): PropsPanelLayout {
  const maxWidth = Math.max(MIN_PANEL_WIDTH, containerWidth - PANEL_MARGIN * 2);
  const maxHeight = Math.max(MIN_PANEL_HEIGHT, containerHeight - PANEL_MARGIN * 2);
  const width = Math.min(maxWidth, Math.max(MIN_PANEL_WIDTH, layout.width));
  const height = Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, layout.height));
  const x = Math.min(Math.max(PANEL_MARGIN, layout.x), Math.max(PANEL_MARGIN, containerWidth - width - PANEL_MARGIN));
  const y = Math.min(Math.max(PANEL_MARGIN, layout.y), Math.max(PANEL_MARGIN, containerHeight - height - PANEL_MARGIN));
  return { x, y, width, height };
}

/** 기본 높이는 컨테이너의 이 비율만큼만 차지한다 — 처음부터 세로를 꽉 채우면 "크기 조절
 *  가능한 창"임이 안 드러나서다(하단에 여백을 남겨 리사이즈 핸들이 눈에 띈다). */
const DEFAULT_HEIGHT_FRACTION = 0.6;

/** 컨테이너 크기 기준 기본 좌표/크기 — 우측 상단, 세로는 컨테이너의 60%만(꽉 안 채움). */
export function defaultLayout(containerWidth: number, containerHeight: number): PropsPanelLayout {
  const width = 280;
  const usable = containerHeight - PANEL_MARGIN * 2;
  const height = Math.max(MIN_PANEL_HEIGHT, Math.min(usable, Math.round(containerHeight * DEFAULT_HEIGHT_FRACTION)));
  const x = Math.max(PANEL_MARGIN, containerWidth - width - PANEL_MARGIN);
  return { x, y: PANEL_MARGIN, width, height };
}

/** 저장값이 없으면 null(호출부가 defaultLayout으로 대체). 형식이 깨졌으면 null. */
export function getStoredPropsPanelLayout(): PropsPanelLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PropsPanelLayout>;
    if (
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      typeof parsed.width !== 'number' ||
      typeof parsed.height !== 'number'
    ) {
      return null;
    }
    return { x: parsed.x, y: parsed.y, width: parsed.width, height: parsed.height };
  } catch {
    return null;
  }
}

export function setStoredPropsPanelLayout(layout: PropsPanelLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // 스토리지 접근 불가 — 이번 세션에서만 유지, 기능은 계속 동작.
  }
}
