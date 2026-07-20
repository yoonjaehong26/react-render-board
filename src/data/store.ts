// 훅킹 레이어(커밋 콜백)와 시각화 레이어를 잇는 작은 외부 스토어.
// useSyncExternalStore와 바로 맞물리게 subscribe/getSnapshot 형태로 만든다.
//
// 커밋마다 일어나는 일:
// 1. serializeFiberTree로 동기 직렬화 → snapshot을 즉시 갱신한다(groupHint는 아직 비어있을 수 있음).
// 2. getFiberId가 커밋 사이에 안정적이라는 사실(ADR-0005에서 확인)을 이용해, 이미 resolve된
//    groupHint를 같은 id에 대해 이어붙인다 — 매 커밋마다 이미 아는 답을 다시 비동기로 묻지 않는다.
// 3. 아직 모르는 composite id만 골라 resolveGroupHints를 비동기로 돌리고, 끝나면 patch로 다시 notify.
//
// 구독자 notify 스로틀 (ADR-0009 ③, ADR-0010, ADR-0050): 시각화 레이어(Canvas)는 notify를 받을
// 때마다 normalizeForCanvas+toFlow를 전체 노드에 대해 재실행한다. 실제 앱의 상호작용 한 번(예:
// 도형 그리기)이나 고빈도 렌더(LiveFeed 60~240Hz)는 짧은 시간에 fiber 커밋을 여러 번 유발하는데,
// 이걸 매번 동기로 notify하면 재계산+React Flow 재렌더가 호스트 앱과 같은 프레임에서 실행돼
// 응답성을 깎는다(실측 2.76배, ADR-0009). snapshot 자체는 handleCommit이 항상 즉시(동기) 갱신해
// 데이터 최신성을 유지하되, notify()는 직전 notify로부터 최소 MIN_NOTIFY_INTERVAL_MS를 띄워
// 상한 ~30Hz로 캡한다(중간 스냅샷은 버려지고 마지막만 반영). 이전 requestIdleCallback 방식은
// "최대 지연"만 보장하고 "최소 간격"은 강제 못 해, 브라우저가 커밋 사이 한가하면 커밋률만큼
// notify가 폭주해 시각화가 과도하게 재렌더됐다(ADR-0050에서 실측·교체).
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

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// 구독자 notify의 최소 간격(ADR-0050). 이 아래로는 재렌더를 묶는다 — 고빈도 앱(예: 60~240Hz
// LiveFeed)에서도 시각화 재렌더가 커밋률을 따라 폭주하지 않게 상한 ~30Hz로 캡한다. 이전
// requestIdleCallback 방식은 "최대 지연"만 보장할 뿐 "최소 간격"을 강제하지 못해, 브라우저가
// 커밋 사이에 한가하면 notify가 커밋률(수백 Hz)만큼 실행돼 시각화가 과도하게 재렌더됐다(실측
// 240Hz 부하에서 BoardContent 174회/초). 데이터 최신성은 handleCommit이 snapshot을 즉시
// 갱신하므로 유지되고, 중간 스냅샷은 어차피 버려도 되는 값이다.
const MIN_NOTIFY_INTERVAL_MS = 33;

// 타임아웃(ADR-0073)으로 폴백된 id를 몇 번까지 다음 커밋에서 재해석할지. ADR-0071은 타임아웃 id도
// hintCache에 캐시해 "같은 fiber를 또 hang시키며 재시도하지 않는다"고 결정했는데, 이는 dev 서버가
// 진짜로 무응답인 경우(Turbopack)엔 맞지만, 대형 라우트의 "동시성 경합으로 인한 일시적 타임아웃"
// (ADR-0073이 진단한 급락의 원인)까지 영구 null로 굳혀 sticky하게 만든다. 동시성 캡(ADR-0073)으로
// 경합 타임아웃 자체가 크게 줄지만, 남은 것도 이후 커밋에서 제한적으로 재시도해 회복시킨다. 재시도
// 예산을 소진하면 영구 null로 확정해(genuine hang에서 매 커밋 재발사 방지) ADR-0071의 수렴성은 지킨다.
const MAX_GROUP_HINT_TIMEOUT_RETRIES = 2;

export function createRenderStore(): RenderStore {
  let snapshot: RenderSnapshot = { commitId: 0, nodes: [] };
  // id -> 이미 resolve된 groupHint + groupPath (dev 세션 동안 계속 누적, 페이지 새로고침 전까지 유지).
  const hintCache = new Map<number, { groupHint: string | null; groupPath: string | null }>();
  // id -> 지금까지의 타임아웃 폴백 횟수(ADR-0073). MAX_GROUP_HINT_TIMEOUT_RETRIES를 넘기기 전까지는
  // hintCache에 넣지 않아 다음 커밋 pending에 다시 잡혀 재해석된다. 정상 resolve되면 삭제된다.
  const groupHintTimeoutRetries = new Map<number, number>();
  // 최신 커밋의 id -> Fiber. RenderSnapshot과 달리 매 커밋 통째로 교체될 뿐 누적하지 않는다
  // (Fiber는 크고 변경 가능한 React 내부 객체라 여러 커밋치를 들고 있을 이유가 없다).
  let latestFibersById = new Map<number, Fiber>();
  const listeners = new Set<SnapshotListener>();

  let notifyScheduled = false;
  let cancelScheduledNotify: (() => void) | null = null;
  let lastNotifyAt = 0;

  function notify() {
    for (const listener of listeners) listener();
  }

  // 연쇄 커밋을 하나의 notify로 묶되, 직전 notify로부터 최소 MIN_NOTIFY_INTERVAL_MS는 띄운다
  // (ADR-0050). 한가할 때 커밋률만큼 폭주하던 문제를 상한 ~30Hz로 캡한다. 첫 커밋(오래 쉰 뒤)은
  // sinceLast가 커 delay 0으로 즉시 반영되고, 짧은 시간 안의 연쇄 커밋만 묶여 늦춰진다.
  function scheduleNotify() {
    if (notifyScheduled) return;
    notifyScheduled = true;
    const sinceLast = now() - lastNotifyAt;
    const delay = Math.max(0, MIN_NOTIFY_INTERVAL_MS - sinceLast);
    const handle = setTimeout(() => {
      notifyScheduled = false;
      cancelScheduledNotify = null;
      lastNotifyAt = now();
      notify();
    }, delay);
    cancelScheduledNotify = () => clearTimeout(handle);
  }

  function applyCachedHints(nodes: RenderNode[]): RenderNode[] {
    return nodes.map((n) => {
      const cached = hintCache.get(n.id);
      return cached !== undefined ? { ...n, groupHint: cached.groupHint, groupPath: cached.groupPath } : n;
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
        for (const r of results) {
          if (r.timedOut) {
            const attempts = (groupHintTimeoutRetries.get(r.id) ?? 0) + 1;
            if (attempts <= MAX_GROUP_HINT_TIMEOUT_RETRIES) {
              // 아직 재시도 예산 남음 — 캐시하지 않아 다음 커밋에서 다시 pending으로 잡혀 재해석된다.
              groupHintTimeoutRetries.set(r.id, attempts);
              continue;
            }
            // 예산 소진 — null로 확정 캐시(genuine hang에서 매 커밋 재발사 방지, ADR-0071 수렴성 유지).
            groupHintTimeoutRetries.delete(r.id);
          } else {
            groupHintTimeoutRetries.delete(r.id);
          }
          hintCache.set(r.id, { groupHint: r.groupHint, groupPath: r.groupPath });
        }
        const patched = applyCachedHints(snapshot.nodes);
        const changed = patched.some(
          (n, i) => n.groupHint !== snapshot.nodes[i]?.groupHint || n.groupPath !== snapshot.nodes[i]?.groupPath,
        );
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
