// 다크모드 선택을 localStorage에 기억해 새로고침 후에도 유지한다. 이 프로젝트에 UI 설정
// 영속화 선례가 아직 없어(interactionStore는 전부 휘발성) 새 추상화를 만들지 않고 가장
// 얇은 get/set 함수 쌍으로 끝낸다. 호스트 앱의 CSP 등으로 localStorage 접근 자체가 막힌
// 환경에서도 이 도구가 죽지 않도록 try/catch로 감싼다.
const STORAGE_KEY = 'rrb:colorMode';

export type StoredColorMode = 'light' | 'dark';

export function getStoredColorMode(): StoredColorMode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function setStoredColorMode(mode: StoredColorMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // 스토리지 접근 불가 — 이번 세션에서만 상태가 안 남을 뿐, 기능 자체는 계속 동작해야 한다.
  }
}
