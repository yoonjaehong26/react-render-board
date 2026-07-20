// 캔버스 스티키노트(ADR-0031) — RenderNode/RenderSnapshot과 무관한 순수 UI 주석이라, 데이터
// 레이어를 거치지 않고 캔버스 좌표계에 좌표(x/y)만 들고 localStorage에 직접 영속화한다.
// vision.md/ui-philosophy.md가 말하는 "온보딩 중 낯선 구조에 메모 남기기" 용도는 1인 로컬
// 사용 시나리오라 실시간 공유 없이 이걸로 충분하다(research/2026-07-17-react-flow-ux-capabilities.md
// 3-B 참고).
const STORAGE_KEY = 'rrb:stickyNotes';

export interface StickyNote {
  id: string;
  x: number;
  y: number;
  text: string;
}

function isStickyNote(value: unknown): value is StickyNote {
  if (!value || typeof value !== 'object') return false;
  const n = value as Record<string, unknown>;
  return typeof n.id === 'string' && typeof n.x === 'number' && typeof n.y === 'number' && typeof n.text === 'string';
}

export function loadStickyNotes(): StickyNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStickyNote);
  } catch {
    return [];
  }
}

export function saveStickyNotes(notes: StickyNote[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // 스토리지 접근 불가 — 이번 세션에서만 저장이 안 될 뿐, 기능 자체는 계속 동작해야 한다.
  }
}

let nextId = 0;

/** 세션 안에서 유일하면 충분하다(localStorage에 저장되는 값은 id 문자열 자체가 아니라
 * 내용이라, 재시작 후 카운터가 0부터 다시 시작해도 기존 노트의 id와 충돌하지 않는다 —
 * 아래 접두사가 이미 로드된 노트의 id 형식과 겹치지 않게 한다). */
export function createStickyNoteId(): string {
  nextId += 1;
  return `sticky-${nextId}-${Math.random().toString(36).slice(2, 8)}`;
}
