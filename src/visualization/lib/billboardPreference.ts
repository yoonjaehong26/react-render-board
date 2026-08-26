// 전광판은 보조 정보라 사용자가 필요할 때만 보이게 하고, 위치도 다른 플로팅 UI처럼 화면
// 비율로 기억한다. 대상 앱 레이아웃에는 관여하지 않는 순수 UI 설정이다.
const STORAGE_KEY = 'rrb:billboardPreference';

export interface BillboardPosition {
  x: number;
  y: number;
}

export interface BillboardPreference {
  visible: boolean;
  position: BillboardPosition;
}

export const DEFAULT_BILLBOARD_PREFERENCE: BillboardPreference = {
  visible: true,
  position: { x: 0.5, y: 0 },
};

export function clampBillboardPosition(position: BillboardPosition): BillboardPosition {
  const clamp = (value: number, fallback: number) =>
    Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
  return {
    x: clamp(position.x, DEFAULT_BILLBOARD_PREFERENCE.position.x),
    y: clamp(position.y, DEFAULT_BILLBOARD_PREFERENCE.position.y),
  };
}

export function getStoredBillboardPreference(): BillboardPreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BILLBOARD_PREFERENCE;
    const parsed = JSON.parse(raw) as Partial<BillboardPreference>;
    if (typeof parsed.visible !== 'boolean' || !parsed.position || typeof parsed.position.x !== 'number' || typeof parsed.position.y !== 'number') {
      return DEFAULT_BILLBOARD_PREFERENCE;
    }
    return { visible: parsed.visible, position: clampBillboardPosition(parsed.position) };
  } catch {
    return DEFAULT_BILLBOARD_PREFERENCE;
  }
}

export function setStoredBillboardPreference(preference: BillboardPreference): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...preference, position: clampBillboardPosition(preference.position) }),
    );
  } catch {
    // 스토리지 접근 불가 환경에서는 이번 세션에서만 유지하고 관찰 기능은 계속 동작한다.
  }
}
