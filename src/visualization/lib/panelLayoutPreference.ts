// 도킹 패널의 위치(하단/좌/우)와 크기를 localStorage에 기억해 새로고침 후에도 유지한다
// (ADR-0040). colorModePreference.ts와 같은 "가장 얇은 get/set" 패턴을 따르고, 호스트 앱의
// CSP 등으로 localStorage 접근이 막힌 환경에서도 이 도구가 죽지 않도록 try/catch로 감싼다.
//
// 크기는 px가 아니라 화면 비율(sizeFraction)로 저장한다 — 하단 도킹이면 화면 높이의, 좌/우
// 도킹이면 화면 너비의 비율로 해석된다. 이렇게 두면 도킹 방향을 바꿔도(높이↔너비) 같은 값을
// 그대로 재사용할 수 있고, 창 크기가 달라져도 비율이 유지된다.
const STORAGE_KEY = 'rrb:panelLayout';

export type PanelDock = 'bottom' | 'left' | 'right';

export interface PanelLayout {
  dock: PanelDock;
  sizeFraction: number;
}

export const MIN_PANEL_FRACTION = 0.2;
export const MAX_PANEL_FRACTION = 0.85;
export const DEFAULT_PANEL_LAYOUT: PanelLayout = { dock: 'bottom', sizeFraction: 0.45 };

export function clampFraction(fraction: number): number {
  if (!Number.isFinite(fraction)) return DEFAULT_PANEL_LAYOUT.sizeFraction;
  return Math.min(MAX_PANEL_FRACTION, Math.max(MIN_PANEL_FRACTION, fraction));
}

function isDock(value: unknown): value is PanelDock {
  return value === 'bottom' || value === 'left' || value === 'right';
}

export function getStoredPanelLayout(): PanelLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PANEL_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<PanelLayout>;
    if (!isDock(parsed.dock) || typeof parsed.sizeFraction !== 'number') return DEFAULT_PANEL_LAYOUT;
    return { dock: parsed.dock, sizeFraction: clampFraction(parsed.sizeFraction) };
  } catch {
    return DEFAULT_PANEL_LAYOUT;
  }
}

export function setStoredPanelLayout(layout: PanelLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // 스토리지 접근 불가 — 이번 세션에서만 상태가 안 남을 뿐, 기능 자체는 계속 동작해야 한다.
  }
}
