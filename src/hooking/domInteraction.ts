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

  subjectContainer.addEventListener('click', handleClick, true);
  console.log('[hooking] react-render-board DOM click bridge started (dev-only)');
  return () => subjectContainer.removeEventListener('click', handleClick, true);
}
