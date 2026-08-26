// 보드 ↔ 실제 DOM 양방향 인터랙션(ADR-0024/0025)을 위한 별도의 작은 UI 상태 store.
// data/store.ts의 RenderSnapshot(Fiber 트리 데이터, architecture.md가 "되돌리기 어려운"
// 스키마로 고정한 것)과는 완전히 분리된, 순수 인터랙션 상태다(ui-philosophy.md가 "되돌리기
// 쉬움"으로 분류하는 영역과 일치). 훅킹 레이어(DOM 클릭 브리지)와 시각화 레이어(Canvas,
// BoardOverlay, DomHighlightOverlay) 양쪽에서 참조된다 — data/store.ts가 이미 훅킹→시각화
// 경계를 넘어 참조되는 것과 같은 전례라 새로운 계층은 아니다.
import type { AiTarget } from '../../hooking/targetContext';

export type InteractionListener = () => void;

export interface InteractionSnapshot {
  boardOpen: boolean;
  /** 지금 하이라이트 중인 실제 DOM 요소들(빈 배열 = 없음). HIGHLIGHT_DURATION_MS 뒤 자동 소멸. */
  highlightedElements: Element[];
  /**
   * 픽 모드에서 마우스가 지금 지나가고 있는 실제 DOM 요소(hover-follow, ADR-0038). 클릭
   * 하이라이트(highlightedElements, 타이머로 자동 소멸)와 달리 타이머가 없다 — 마우스가
   * 움직일 때마다 즉시 교체되고, 픽 모드를 끄거나 앱 밖으로 나가면 비워진다. "클릭하면
   * 이게 선택된다"를 미리 보여주는 라이브 프리뷰라, 클릭 하이라이트와 시각적으로도 구분한다.
   */
  hoverElements: Element[];
  /**
   * hoverElements가 가리키는 요소에 대응하는 노드 id(라이브 hover, ADR-0032 Q "Alt-held 동시
   * 하이라이트"). 실제 요소를 hover하면 그 요소를 그린 컴포넌트 노드를 다이어그램에서도 동시에
   * 햇칭으로 밝히기 위한 값 — hoverElements와 함께 갱신되고 함께 비워진다. 없으면 null.
   */
  hoverNodeId: number | null;
  /** hover-follow 중인 요소의 Fiber 기반 짧은 설명. 전광판의 일시 프리뷰 전용이다. */
  hoverTarget: AiTarget | null;
  /** Alt+click/픽 클릭으로 고정한 AI target card. 새로고침 전까지 UI에 남는다. */
  selectedTarget: AiTarget | null;
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
  /** 픽/Alt-held hover-follow 프리뷰(ADR-0038 + 후속). 같은 (요소, 노드) 조합이면 무시(재렌더
   * 방지), 타이머 없음. nodeId는 그 요소에 대응하는 노드 id(다이어그램 동시 하이라이트용). */
  setHoverElements(elements: Element[], nodeId?: number | null, target?: AiTarget | null): void;
  selectTarget(target: AiTarget): void;
  clearSelectedTarget(): void;
  requestNavigate(rawId: number): void;
  consumeNavigate(): void;
  setPickMode(active: boolean): void;
}

export const HIGHLIGHT_DURATION_MS = 1600;

export function createInteractionStore(): InteractionStore {
  let snapshot: InteractionSnapshot = {
    boardOpen: false,
    highlightedElements: [],
    hoverElements: [],
    hoverNodeId: null,
    hoverTarget: null,
    selectedTarget: null,
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
    setHoverElements(elements, nodeId = null, target = null) {
      // 같은 (요소 집합, 노드 id)이면 알림을 보내지 않는다 — mousemove가 한 요소 위에서 수없이
      // 발생해도 실제로 바뀔 때만 재렌더가 일어나게 한다.
      const current = snapshot.hoverElements;
      const sameEls = current.length === elements.length && current.every((el, i) => el === elements[i]);
      if (sameEls && snapshot.hoverNodeId === nodeId && sameTarget(snapshot.hoverTarget, target)) return;
      patch({ hoverElements: elements, hoverNodeId: nodeId, hoverTarget: target });
    },
    selectTarget(target) {
      patch({ selectedTarget: target });
    },
    clearSelectedTarget() {
      if (snapshot.selectedTarget === null) return;
      patch({ selectedTarget: null });
    },
    requestNavigate(rawId) {
      patch({ boardOpen: true, navigateToNodeId: rawId, navigateRequestId: snapshot.navigateRequestId + 1 });
    },
    consumeNavigate() {
      if (snapshot.navigateToNodeId === null) return;
      patch({ navigateToNodeId: null });
    },
    setPickMode(active) {
      // 픽 모드를 끄면 hover 프리뷰도 즉시 비운다 — 모드가 꺼졌는데 마지막 hover 박스가
      // 화면에 남아 있으면 안 된다.
      patch(
        active
          ? { pickModeActive: true }
          : { pickModeActive: false, hoverElements: [], hoverNodeId: null, hoverTarget: null },
      );
    },
  };
}

function sameTarget(a: AiTarget | null, b: AiTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.tagName !== b.tagName || a.role !== b.role || a.name !== b.name) return false;
  const samePath = a.componentPath.length === b.componentPath.length && a.componentPath.every((name, i) => name === b.componentPath[i]);
  if (!samePath) return false;
  const aInstance = a.instance ?? null;
  const bInstance = b.instance ?? null;
  return (
    aInstance === bInstance ||
    (aInstance !== null &&
      bInstance !== null &&
      aInstance.componentName === bInstance.componentName &&
      aInstance.label === bInstance.label &&
      aInstance.position === bInstance.position &&
      aInstance.total === bInstance.total)
  );
}
