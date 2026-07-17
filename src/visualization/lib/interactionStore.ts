// 보드 ↔ 실제 DOM 양방향 인터랙션(ADR-0024/0025)을 위한 별도의 작은 UI 상태 store.
// data/store.ts의 RenderSnapshot(Fiber 트리 데이터, architecture.md가 "되돌리기 어려운"
// 스키마로 고정한 것)과는 완전히 분리된, 순수 인터랙션 상태다(ui-philosophy.md가 "되돌리기
// 쉬움"으로 분류하는 영역과 일치). 훅킹 레이어(DOM 클릭 브리지)와 시각화 레이어(Canvas,
// BoardOverlay, DomHighlightOverlay) 양쪽에서 참조된다 — data/store.ts가 이미 훅킹→시각화
// 경계를 넘어 참조되는 것과 같은 전례라 새로운 계층은 아니다.
export type InteractionListener = () => void;

export interface InteractionSnapshot {
  boardOpen: boolean;
  /** 지금 하이라이트 중인 실제 DOM 요소들(빈 배열 = 없음). HIGHLIGHT_DURATION_MS 뒤 자동 소멸. */
  highlightedElements: Element[];
  /**
   * 역방향(DOM 클릭)이 보드에 남기는 "이 raw id로 이동해줘" 요청. bippy가 돌려주는 raw id라
   * host 노드일 수 있고, 지금 보드에 안 보일 수도 있다 — 실제로 보이는 id로 바꾸는 건
   * normalize.ts의 resolveVisibleId 몫이다. Canvas가 처리한 뒤 consumeNavigate()로 리셋한다.
   */
  navigateToNodeId: number | null;
  /**
   * requestNavigate()가 호출될 때마다 1씩 증가하는 nonce. 도킹 패널(ADR-0025)에서는 보드가
   * 이미 열려 있는 채로 같은 DOM 요소를 다시 클릭하는 게 실제로 가능하다 — 그 경우
   * navigateToNodeId 값 자체는 이전 요청과 같을 수 있어(예: 같은 요소를 두 번 클릭), 그 값만
   * React useEffect 의존성으로 쓰면 두 번째 요청이 무시된다. Canvas는 이 nonce를 의존성으로
   * 써서 "같은 id로의 새 요청"도 놓치지 않는다.
   */
  navigateRequestId: number;
  /**
   * "요소 선택" 모드(ADR-0025 후속 수정). 켜져 있으면 계측 대상 앱 안의 모든 클릭이
   * 역방향 인터랙션으로 취급되고(그 클릭의 원래 동작은 막힌다), 꺼져 있으면 평소처럼
   * 앱을 조작할 수 있다 — Alt(⌥) 키를 누른 채 클릭하면 이 모드와 무관하게 항상 한 번
   * 픽 가능하다. domInteraction.ts의 startDomClickBridge가 이 값을 읽는다.
   */
  pickModeActive: boolean;
}

export interface InteractionStore {
  subscribe(listener: InteractionListener): () => void;
  getSnapshot(): InteractionSnapshot;
  setBoardOpen(open: boolean): void;
  /** 새 하이라이트 요청은 이전 것을 즉시 대체한다(타이머도 다시 시작). */
  highlight(elements: Element[]): void;
  requestNavigate(rawId: number): void;
  consumeNavigate(): void;
  setPickMode(active: boolean): void;
}

export const HIGHLIGHT_DURATION_MS = 1600;

export function createInteractionStore(): InteractionStore {
  let snapshot: InteractionSnapshot = {
    boardOpen: false,
    highlightedElements: [],
    navigateToNodeId: null,
    navigateRequestId: 0,
    pickModeActive: false,
  };
  const listeners = new Set<InteractionListener>();
  let highlightTimer: ReturnType<typeof setTimeout> | null = null;

  function notify() {
    for (const listener of listeners) listener();
  }

  function patch(next: Partial<InteractionSnapshot>) {
    snapshot = { ...snapshot, ...next };
    notify();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    setBoardOpen(open) {
      patch({ boardOpen: open });
    },
    highlight(elements) {
      if (highlightTimer) clearTimeout(highlightTimer);
      patch({ highlightedElements: elements });
      highlightTimer = setTimeout(() => {
        highlightTimer = null;
        patch({ highlightedElements: [] });
      }, HIGHLIGHT_DURATION_MS);
    },
    requestNavigate(rawId) {
      patch({ boardOpen: true, navigateToNodeId: rawId, navigateRequestId: snapshot.navigateRequestId + 1 });
    },
    consumeNavigate() {
      if (snapshot.navigateToNodeId === null) return;
      patch({ navigateToNodeId: null });
    },
    setPickMode(active) {
      patch({ pickModeActive: active });
    },
  };
}
