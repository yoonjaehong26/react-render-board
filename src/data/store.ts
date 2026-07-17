// 훅킹 레이어(커밋 콜백)와 시각화 레이어를 잇는 작은 외부 스토어.
// useSyncExternalStore와 바로 맞물리게 subscribe/getSnapshot 형태로 만든다.
//
// 커밋마다 일어나는 일:
// 1. serializeFiberTree로 동기 직렬화 → snapshot을 즉시 갱신한다(groupHint는 아직 비어있을 수 있음).
// 2. getFiberId가 커밋 사이에 안정적이라는 사실(ADR-0005에서 확인)을 이용해, 이미 resolve된
//    groupHint를 같은 id에 대해 이어붙인다 — 매 커밋마다 이미 아는 답을 다시 비동기로 묻지 않는다.
// 3. 아직 모르는 composite id만 골라 resolveGroupHints를 비동기로 돌리고, 끝나면 patch로 다시 notify.
//
// 구독자 notify 디바운스 (ADR-0009 ③, ADR-0010): 시각화 레이어(Canvas)는 notify를 받을 때마다
// normalizeForCanvas+toFlow를 전체 노드에 대해 재실행한다. 실제 앱에서 상호작용 한 번(예: 도형
// 그리기)은 짧은 시간에 fiber 커밋을 여러 번 유발하는데, 이걸 매번 동기로 notify하면 그 재계산+
// React Flow 재렌더가 호스트 앱의 상호작용과 같은 프레임/태스크에서 실행돼 응답성을 깎아먹는다
// (실측 2.76배, ADR-0009). snapshot 자체는 handleCommit 안에서 항상 즉시(동기) 갱신해 데이터
// 최신성을 유지하되, 구독자에게 알리는 notify()만 requestIdleCallback(폴백: setTimeout)으로
// 커밋 프레임과 분리하고 짧은 시간 안의 연쇄 커밋을 하나의 notify로 묶는다 — 중간 스냅샷은
// 버려지고 마지막 스냅샷만 반영되므로 상관없다.
import type { Fiber } from 'bippy';
import { serializeFiberTree } from './serialize';
import { resolveGroupHints } from './sourceHints';
import type { RenderNode, RenderSnapshot } from './types';

export type SnapshotListener = () => void;

export interface RenderStore {
  subscribe(listener: SnapshotListener): () => void;
  getSnapshot(): RenderSnapshot;
  handleCommit(root: Fiber): void;
  /**
   * 노드 id로 최신 커밋의 원본 Fiber를 찾는다(보드↔DOM 양방향 인터랙션 전용,
   * ADR-0024/0025). RenderSnapshot과 달리 반응형이 아니다 — 구독자에게 notify를
   * 유발하지 않는 순수 imperative getter이며, 클릭 핸들러 같은 이벤트 코드에서만 쓴다.
   * 커밋이 갈릴 때마다 통째로 교체되므로 이전 커밋에만 있던 id는 undefined를 반환한다.
   */
  getFiber(id: number): Fiber | undefined;
}

function scheduleIdle(cb: () => void, timeout: number): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(cb, { timeout });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(cb, 0);
  return () => clearTimeout(handle);
}

export function createRenderStore(): RenderStore {
  let snapshot: RenderSnapshot = { commitId: 0, nodes: [] };
  // id -> 이미 resolve된 groupHint (dev 세션 동안 계속 누적, 페이지 새로고침 전까지 유지).
  const hintCache = new Map<number, string | null>();
  // 최신 커밋의 id -> Fiber. RenderSnapshot과 달리 매 커밋 통째로 교체될 뿐 누적하지 않는다
  // (Fiber는 크고 변경 가능한 React 내부 객체라 여러 커밋치를 들고 있을 이유가 없다).
  let latestFibersById = new Map<number, Fiber>();
  const listeners = new Set<SnapshotListener>();

  let notifyScheduled = false;
  let cancelScheduledNotify: (() => void) | null = null;

  function notify() {
    for (const listener of listeners) listener();
  }

  // 연쇄 커밋을 하나의 idle 콜백으로 묶는다. timeout(100ms)은 메인 스레드가 계속 바쁠 때도
  // notify가 무한정 밀리지 않고 최대 100ms 안에는 반영되도록 하는 상한이다.
  function scheduleNotify() {
    if (notifyScheduled) return;
    notifyScheduled = true;
    cancelScheduledNotify = scheduleIdle(() => {
      notifyScheduled = false;
      cancelScheduledNotify = null;
      notify();
    }, 100);
  }

  function applyCachedHints(nodes: RenderNode[]): RenderNode[] {
    return nodes.map((n) => {
      const cached = hintCache.get(n.id);
      return cached !== undefined ? { ...n, groupHint: cached } : n;
    });
  }

  function handleCommit(root: Fiber) {
    const { nodes, compositeFibers, fibersById } = serializeFiberTree(root);
    latestFibersById = fibersById;
    snapshot = { commitId: snapshot.commitId + 1, nodes: applyCachedHints(nodes) };
    scheduleNotify();

    if (!import.meta.env.DEV) return; // 그룹핑 힌트는 dev 전용 (ADR-0007).

    const pending = new Map([...compositeFibers].filter(([id]) => !hintCache.has(id)));
    if (pending.size === 0) return;

    resolveGroupHints(pending)
      .then((results) => {
        for (const r of results) hintCache.set(r.id, r.groupHint);
        const patched = applyCachedHints(snapshot.nodes);
        const changed = patched.some((n, i) => n.groupHint !== snapshot.nodes[i]?.groupHint);
        if (changed) {
          snapshot = { commitId: snapshot.commitId, nodes: patched };
          scheduleNotify();
        }
      })
      .catch((err) => {
        console.error('[data-layer] groupHint 해석 실패', err);
      });
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && cancelScheduledNotify) {
          cancelScheduledNotify();
          notifyScheduled = false;
          cancelScheduledNotify = null;
        }
      };
    },
    getSnapshot() {
      return snapshot;
    },
    handleCommit,
    getFiber(id) {
      return latestFibersById.get(id);
    },
  };
}
