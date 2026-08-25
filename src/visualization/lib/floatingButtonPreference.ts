// 플로팅 보드 버튼 묶음의 화면상 위치를 localStorage에 기억한다(ADR-0078).
// 좌표를 픽셀이 아니라 0~1 비율로 저장하면 창 크기·반응형 뷰포트가 달라져도 사용자가
// 의도한 대략적인 위치가 유지된다. 실제 px 좌표/버튼 크기 경계 보정은 BoardOverlay가 맡는다.
const STORAGE_KEY = 'rrb:floatingButtonPosition';

export interface FloatingButtonPosition {
  /** 이동 가능한 가로 범위에서 0=왼쪽, 1=오른쪽. */
  x: number;
  /** 이동 가능한 세로 범위에서 0=위, 1=아래. */
  y: number;
}

export const DEFAULT_FLOATING_BUTTON_POSITION: FloatingButtonPosition = { x: 1, y: 1 };

export function clampPosition(position: FloatingButtonPosition): FloatingButtonPosition {
  const clamp = (value: number, fallback: number) =>
    Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
  return {
    x: clamp(position.x, DEFAULT_FLOATING_BUTTON_POSITION.x),
    y: clamp(position.y, DEFAULT_FLOATING_BUTTON_POSITION.y),
  };
}

export function getStoredFloatingButtonPosition(): FloatingButtonPosition {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FLOATING_BUTTON_POSITION;
    const parsed = JSON.parse(raw) as Partial<FloatingButtonPosition>;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return DEFAULT_FLOATING_BUTTON_POSITION;
    return clampPosition({ x: parsed.x, y: parsed.y });
  } catch {
    return DEFAULT_FLOATING_BUTTON_POSITION;
  }
}

export function setStoredFloatingButtonPosition(position: FloatingButtonPosition): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clampPosition(position)));
  } catch {
    // 스토리지 접근 불가 — 이번 세션에서만 위치가 유지되고 기능은 계속 동작한다.
  }
}
