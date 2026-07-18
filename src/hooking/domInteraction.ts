// 보드 ↔ 실제 DOM 양방향 인터랙션(ADR-0024/0025)의 Fiber ↔ DOM 매핑 유틸 + 역방향(DOM 클릭)
// 브리지. fiberInspector.ts와 같은 devtools-only 실행 + try/catch 원칙은 그대로 지키되,
// "대상 앱을 방해하지 않는다"는 원칙은 이번엔 조건부다 — 최초 구현(그냥 모든 클릭에 반응)이
// 실제로 계측 대상 앱의 모든 버튼 클릭(예: "항목 추가")을 역방향 인터랙션으로 가로채 버려
// 정상적인 앱 사용 자체를 막는 문제가 실측(scripts/verify.mjs)으로 드러났다. 그래서 "요소
// 선택" 의도가 명시적일 때만(Alt(⌥)+클릭, 또는 pickModeActive 토글) 개입하도록 좁혔다 —
// React DevTools의 엘리먼트 피커와 같은 모델. 이 좁은 조건에서만 preventDefault/
// stopPropagation을 호출해 대상 앱 자신의 클릭 핸들러가 실행되지 않게 한다(캡처 단계에서
// React의 델리게이트 리스너보다 먼저 가로채야 실제로 막을 수 있다 — 아래 참고). 그 조건에
// 해당하지 않는 평소 클릭은 이 브리지가 존재하는지조차 티가 안 나야 한다.
//
// bippy가 이미 React DevTools의 "요소 선택" 기능과 같은 메커니즘을 제공한다 — 직접 구현할
// 필요가 없다:
// - getFiberFromHostInstance(el): DOM 요소 → Fiber. 실제로는 devtools hook의
//   renderers.findFiberByHostInstance를 우선 쓰고, `__reactFiber$<random>` 프로퍼티 스캔으로
//   폴백한다(node_modules/bippy/dist/core.cjs 직접 확인).
// - getNearestHostFibers(fiber): 어떤 fiber든(host 자신이거나 composite) 그 fiber가 실제로
//   그리는 가장 가까운 host(DOM) fiber들을 돌려준다.
import { getFiberFromHostInstance, getFiberId, getNearestHostFibers, type Fiber } from 'bippy';
import type { InteractionStore } from '../visualization/lib/interactionStore';

/** 실제 DOM 요소 → 그 요소를 그린 fiber의 id(RenderNode.id와 같은 채번 체계). 못 찾으면 null. */
export function findFiberIdForElement(el: Element): number | null {
  const fiber = getFiberFromHostInstance(el);
  if (!fiber) return null;
  return getFiberId(fiber);
}

/**
 * 노드 id로 얻은 fiber → 그 컴포넌트가 실제로 렌더한 DOM 요소들(정방향, 보드 노드 클릭).
 * fiber 자신이 이미 host(DOM) fiber면 자기 자신만, composite면 가장 가까운 host 자손들을
 * 돌려준다(bippy getNearestHostFibers의 동작 그대로 — 별도 순회를 다시 구현하지 않는다).
 */
export function resolveHostElements(fiber: Fiber): Element[] {
  return getNearestHostFibers(fiber)
    .map((f) => f.stateNode)
    .filter((node): node is Element => node instanceof Element);
}

/**
 * 역방향: 계측 대상 앱(subjectContainer) 안에서 "요소 선택 의도가 명시적인" 클릭 —
 * Alt(⌥)를 누른 채 클릭했거나, interactionStore.pickModeActive가 켜져 있을 때 — 가 일어나면
 * 그 DOM 요소를 fiber id로 역조회해 interactionStore에 "보드를 열고 이 id로 이동해줘 + 이
 * 요소를 하이라이트해줘"를 요청한다. 그 외의 평소 클릭은 이 리스너가 아예 없는 것처럼 그대로
 * 통과한다.
 *
 * 캡처 단계에 리스너를 단다 — React 17+는 root 컨테이너에 버블 단계로 이벤트를 델리게이트하므로
 * (subjectContainer 자신이 그 root), 같은 요소에 버블 단계로 리스너를 달면 React의 onClick이
 * 이미 실행된 뒤라 preventDefault를 불러도 늦는다. 캡처 단계에서 먼저 가로채야 "이 클릭은
 * 선택으로 처리하고 앱 자신의 핸들러는 실행되지 않게" 할 수 있다.
 *
 * pickModeActive로 픽을 성공하면 모드를 자동으로 끈다(브라우저 네이티브 "요소 검사"와 같은
 * 1회성 동작) — 켜둔 채 깜빡 잊고 앱을 조작하다 클릭마다 막히는 사고를 줄인다. Alt+클릭은
 * pickModeActive와 무관하게 항상 되고, 모드 상태를 건드리지 않는다.
 */
export function startDomClickBridge(subjectContainer: Element, interactionStore: InteractionStore): () => void {
  if (!import.meta.env.DEV) {
    return () => {};
  }

  function handleClick(event: Event) {
    if (!(event instanceof MouseEvent)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    const pickModeActive = interactionStore.getSnapshot().pickModeActive;
    if (!event.altKey && !pickModeActive) return; // 평소 클릭 — 관여하지 않는다.

    event.preventDefault();
    event.stopPropagation();

    try {
      const id = findFiberIdForElement(target);
      if (id !== null) {
        interactionStore.requestNavigate(id);
        interactionStore.highlight([target]);
      }
    } catch (err) {
      console.error('[hooking] DOM 클릭 브리지 처리 중 에러', err);
    } finally {
      if (pickModeActive) interactionStore.setPickMode(false);
    }
  }

  // hover-follow 프리뷰(ADR-0038 + Alt-held 후속): 픽 모드가 켜져 있거나 **Alt(⌥) 키를 누르고
  // 있는 동안** 마우스를 따라 커서 아래 요소를 interactionStore.hoverElements에 실시간으로 올리고,
  // 그 요소에 대응하는 노드 id도 함께 올려(setHoverElements의 nodeId) 다이어그램에서 그 노드를
  // 동시에 햇칭으로 밝힌다("클릭하면 이게 선택된다"를 실제 요소 + 보드 양쪽에서). mousemove는
  // 매우 잦으므로 requestAnimationFrame으로 프레임당 1회만 반영하고, 픽 모드가 꺼져 있고 Alt도
  // 안 눌렸을 때는 리스너 자체를 떼어 평소엔 mousemove 비용이 0이 되게 한다.
  let rafId: number | null = null;
  let lastTarget: Element | null = null;
  let altHeld = false;

  function handleMove(event: Event) {
    if (!(event instanceof MouseEvent)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    lastTarget = target;
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (!lastTarget) return;
      // 커서 아래 요소 + 그 요소를 그린 노드 id를 함께 올린다(다이어그램 동시 하이라이트).
      let id: number | null = null;
      try {
        id = findFiberIdForElement(lastTarget);
      } catch {
        id = null;
      }
      interactionStore.setHoverElements([lastTarget], id);
    });
  }

  function clearHover() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastTarget = null;
    interactionStore.setHoverElements([], null);
  }

  let hoverAttached = false;
  function syncHoverListeners() {
    // 픽 모드 토글 OR Alt 키를 누르고 있는 동안 hover를 활성화한다.
    const active = interactionStore.getSnapshot().pickModeActive || altHeld;
    if (active && !hoverAttached) {
      subjectContainer.addEventListener('mousemove', handleMove, true);
      subjectContainer.addEventListener('mouseleave', clearHover, true);
      hoverAttached = true;
    } else if (!active && hoverAttached) {
      subjectContainer.removeEventListener('mousemove', handleMove, true);
      subjectContainer.removeEventListener('mouseleave', clearHover, true);
      hoverAttached = false;
      clearHover();
    }
  }

  // Alt(⌥) 키를 누르고 있는 동안 hover를 켠다(키 반복 이벤트는 전이일 때만 반영). 창 포커스가
  // 빠지면(blur) Alt keyup을 못 받을 수 있어 안전하게 해제한다.
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Alt' && !altHeld) {
      altHeld = true;
      syncHoverListeners();
    }
  }
  function handleKeyUp(event: KeyboardEvent) {
    if (event.key === 'Alt' && altHeld) {
      altHeld = false;
      syncHoverListeners();
    }
  }
  function handleBlur() {
    if (altHeld) {
      altHeld = false;
      syncHoverListeners();
    }
  }

  subjectContainer.addEventListener('click', handleClick, true);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('keyup', handleKeyUp, true);
  window.addEventListener('blur', handleBlur);
  const unsubscribe = interactionStore.subscribe(syncHoverListeners);
  syncHoverListeners();
  console.log('[hooking] react-render-board DOM click bridge started (dev-only)');
  return () => {
    subjectContainer.removeEventListener('click', handleClick, true);
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('keyup', handleKeyUp, true);
    window.removeEventListener('blur', handleBlur);
    unsubscribe();
    if (hoverAttached) {
      subjectContainer.removeEventListener('mousemove', handleMove, true);
      subjectContainer.removeEventListener('mouseleave', clearHover, true);
    }
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
}
