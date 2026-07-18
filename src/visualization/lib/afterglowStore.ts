// 변경 흐름/잔상 상태 store (ADR-0032). React Scan의 결함("변화의 순간"과 "볼 수 있는 시간"을
// 0.2초로 묶어 빠른 변화에서 스트로브만 남는 것)을 피하기 위해 두 시간을 분리한다: 노드가
// 바뀌면 heat를 올리고(bump), heat는 몇 초에 걸쳐 천천히 식는다(decay). 빠르게 반복 변하면
// heat가 누적돼(상한 1) "바쁜 구역"이 지속 발광한다. 일시정지하면 식지도 오르지도 않는다.
//
// interactionStore.ts와 같은 subscribe/getSnapshot 패턴이지만, 스냅샷을 통째로 넘기지 않고
// heat를 id로 개별 조회하게 한 이유: 각 ComponentNode/GroupNode가 useSyncExternalStore로 자기
// heat만 구독하면, decay 틱마다 heat가 0인(대다수) 노드는 반환값이 안 바뀌어 리렌더되지 않는다
// — 발광 중인 소수만 리렌더된다. 전체 flowNodes 배열을 매 틱 다시 만들지 않으므로 ADR-0017의
// "배열 크기 = React Flow 비용" 함정을 피한다.
//
// 두 채널: (1) 노드 heat(숫자 id, 상세 모드에서 뷰포트 안 컴포넌트) (2) 그룹 heat(그룹 노드 id
// 문자열, 지도 모드에서 그룹 단위 활동 집계, ADR-0032 Q2 "활동 기상도"). 둘 다 같은 decay/일시정지
// 를 공유하고, 각각 별도 조회 API로 노출한다.
export type AfterglowListener = () => void;

export interface AfterglowStore {
  subscribe(listener: AfterglowListener): () => void;
  /** 이 노드의 현재 heat(0~1). 없으면 0. useSyncExternalStore의 getSnapshot으로 쓴다(안정된 원시값). */
  getHeat(id: number): number;
  /** 이 그룹(그룹 노드 id, 예: "group:Foo.tsx")의 집계 heat(0~1). 지도 모드 그룹 흐름용. */
  getGroupHeat(groupId: string): number;
  /** notify가 일어날 때마다 1 증가하는 단조 카운터. heat 자체가 아니라 "무언가 바뀌었다"만
   * 구독하고 싶은 곳(예: 간선 발광 재계산)이 useSyncExternalStore의 getSnapshot으로 쓴다. */
  getVersion(): number;
  /** 이번 커밋에 props가 바뀐 노드들의 heat를 올린다(누적, 상한 1). 일시정지 중이면 무시. */
  bump(ids: Iterable<number>): void;
  /** 이번 커밋에 멤버가 바뀐 그룹들의 heat를 올린다(지도 모드 집계). 일시정지 중이면 무시. */
  bumpGroups(groupIds: Iterable<string>): void;
  /** 일시정지: decay와 bump를 모두 멈춰 마지막 상태를 고정한다. */
  setPaused(paused: boolean): void;
  /** 모든 heat를 즉시 지운다(흐름 모드 끌 때). */
  clear(): void;
  /** 타이머/리스너 정리(Canvas 언마운트 시). */
  dispose(): void;
}

// heat가 절반으로 식는 데 걸리는 시간. 1 → MIN_HEAT(0.02)까지 대략 5초 남짓 걸린다("몇 초에
// 걸쳐 천천히 식는", ADR-0032). React Scan의 0.2초와 대비되는 이 도구의 정체성 지점.
export const AFTERGLOW_HALF_LIFE_MS = 900;
// decay 틱 간격. 짧을수록 부드럽지만 리렌더가 잦다 — 발광 노드만 리렌더되므로 120ms면 충분히 매끄럽다.
export const AFTERGLOW_TICK_MS = 120;
// 한 번 bump할 때 더해지는 heat. 반복 변경이 누적돼 상한 1에 붙으면 지속 발광이 된다.
export const AFTERGLOW_BUMP = 0.6;
// 이 값 아래로 식으면 사실상 안 보이므로 맵에서 제거한다.
const MIN_HEAT = 0.02;

export function createAfterglowStore(): AfterglowStore {
  const heat = new Map<number, number>();
  const groupHeat = new Map<string, number>();
  const listeners = new Set<AfterglowListener>();
  let paused = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let version = 0;
  const decayFactor = Math.pow(0.5, AFTERGLOW_TICK_MS / AFTERGLOW_HALF_LIFE_MS);

  function notify() {
    version++;
    for (const listener of listeners) listener();
  }

  const isEmpty = () => heat.size === 0 && groupHeat.size === 0;

  function ensureTimer() {
    if (timer !== null || paused || isEmpty()) return;
    timer = setInterval(tick, AFTERGLOW_TICK_MS);
  }

  function stopTimer() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  // 한 heat 맵을 한 틱만큼 식힌다(MIN_HEAT 아래는 제거).
  function decayMap<K>(map: Map<K, number>) {
    for (const [id, value] of map) {
      const next = value * decayFactor;
      if (next < MIN_HEAT) map.delete(id);
      else map.set(id, next);
    }
  }

  function tick() {
    if (paused) {
      stopTimer();
      return;
    }
    decayMap(heat);
    decayMap(groupHeat);
    if (isEmpty()) stopTimer();
    notify();
  }

  function bumpMap<K>(map: Map<K, number>, ids: Iterable<K>) {
    if (paused) return;
    let any = false;
    for (const id of ids) {
      map.set(id, Math.min(1, (map.get(id) ?? 0) + AFTERGLOW_BUMP));
      any = true;
    }
    if (any) {
      ensureTimer();
      notify();
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getHeat(id) {
      return heat.get(id) ?? 0;
    },
    getGroupHeat(groupId) {
      return groupHeat.get(groupId) ?? 0;
    },
    getVersion() {
      return version;
    },
    bump(ids) {
      bumpMap(heat, ids);
    },
    bumpGroups(groupIds) {
      bumpMap(groupHeat, groupIds);
    },
    setPaused(next) {
      if (paused === next) return;
      paused = next;
      if (paused) stopTimer();
      else ensureTimer();
    },
    clear() {
      if (isEmpty()) return;
      heat.clear();
      groupHeat.clear();
      stopTimer();
      notify();
    },
    dispose() {
      stopTimer();
      listeners.clear();
      heat.clear();
      groupHeat.clear();
    },
  };
}
