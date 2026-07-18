// props 흐름/변경 잔상(ADR-0032)의 노드별 프레젠테이션 상태를 ComponentNode까지 내려보내는
// React context 모음. 두 상태(잔상 heat, 참조 추적 여부)를 toFlow.ts의 ComponentNodeData가
// 아니라 context로 나르는 이유:
//   1. heat는 decay 틱마다 바뀌는데, toFlow data로 넣으면 매 틱 전체 flowNodes 배열을 다시
//      만들어야 해 ADR-0017의 "배열 크기 = React Flow 비용" 함정에 정면으로 걸린다. context +
//      useSyncExternalStore로 자기 heat만 구독하면 발광 중인 소수 노드만 리렌더된다.
//   2. tracked는 toFlow.ts에 필드를 더하면 되지만, 그 파일은 동시 세션(ADR-0028/0030 도형/손그림)이
//      활발히 편집 중이라 공유면을 줄이려고 heat와 같은 채널(context)로 통일했다. 강제 확장
//      로직은 Canvas의 shouldExpandGroup에만 얹는다.
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AfterglowStore } from '../lib/afterglowStore';

// Provider가 없을 때(잔상 기능 미사용 통합, 또는 ComponentNode 단독 테스트)의 기본값 —
// 항상 heat 0을 돌려주는 no-op store. 진짜 store와 시그니처가 같아 useAfterglowHeat이 조건
// 없이 항상 같은 훅을 부를 수 있다(리액트 훅 규칙).
const NOOP_AFTERGLOW: AfterglowStore = {
  subscribe: () => () => {},
  getHeat: () => 0,
  getGroupHeat: () => 0,
  getVersion: () => 0,
  bump: () => {},
  bumpGroups: () => {},
  setPaused: () => {},
  clear: () => {},
  dispose: () => {},
};

export const AfterglowContext = createContext<AfterglowStore>(NOOP_AFTERGLOW);

const EMPTY_TRACKED: ReadonlySet<number> = new Set();
/** prop 참조 추적(ADR-0032)이 지금 하이라이트하는 노드 id 집합. Provider 없으면 빈 집합. */
export const TrackedNodesContext = createContext<ReadonlySet<number>>(EMPTY_TRACKED);

/** 이 노드의 현재 heat(0~1)를 구독한다. heat가 안 바뀌면(대다수 노드는 0 고정) 리렌더되지 않는다. */
export function useAfterglowHeat(id: number): number {
  const store = useContext(AfterglowContext);
  return useSyncExternalStore(
    store.subscribe,
    () => store.getHeat(id),
    () => 0,
  );
}

/** 이 노드가 지금 참조 추적으로 강조 대상인지(ADR-0032 3층). */
export function useIsTracked(id: number): boolean {
  return useContext(TrackedNodesContext).has(id);
}

/** 이 그룹(그룹 노드 id)의 집계 heat(0~1) — 지도 모드 그룹 단위 흐름(ADR-0032 Q2). */
export function useGroupAfterglowHeat(groupId: string): number {
  const store = useContext(AfterglowContext);
  return useSyncExternalStore(
    store.subscribe,
    () => store.getGroupHeat(groupId),
    () => 0,
  );
}
