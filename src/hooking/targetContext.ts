// 선택한 실제 DOM 요소를 AI에게 전달할 짧은 "target card"로 바꾸는 순수 경계.
//
// CSS selector는 지금 이 DOM을 다시 찾는 기술적 폴백일 뿐, React 컴포넌트 안의 빈 div가
// 무엇인지 사람이나 코드 에이전트에게 설명하지 못한다. RRB가 이미 가진 DOM → Fiber 연결을
// 이용해 "어느 컴포넌트가 렌더했는가"를 함께 낸다. 이 값은 RenderNode 스키마에 넣지 않는다:
// 클릭/hover 순간에만 필요한 UI side-channel이고, 커밋마다 직렬화할 데이터가 아니다.
import { getDisplayName, getFiberFromHostInstance, isCompositeFiber, type Fiber } from 'bippy';

const MAX_COMPONENTS_IN_PATH = 3;
const MAX_ELEMENT_NAME_LENGTH = 72;

export interface AiTarget {
  /** 현재 페이지의 pathname. query/hash는 안정성·민감 정보 측면에서 기본 전달에서 제외한다. */
  pagePath?: string | null;
  /** 루트 → 선택 요소에 가장 가까운 컴포넌트 순. 이름 없는/internal Fiber는 제외한다. */
  componentPath: string[];
  /** 실제 선택 host element의 HTML 태그명(소문자). */
  tagName: string;
  /** ARIA 또는 native role을 얻었을 때만 채운다. */
  role: string | null;
  /** aria-label/labelledby/텍스트에서 얻은 짧은 이름. 없으면 null. */
  name: string | null;
  /** 같은 React 컴포넌트가 반복 렌더된 경우에만 붙는 인스턴스 문맥. */
  instance?: AiTargetInstance | null;
}

export interface AiTargetInstance {
  /** 반복된 composite 컴포넌트의 이름. componentPath 안의 같은 조각을 보강한다. */
  componentName: string;
  /** 카드/행 안에서 먼저 찾은 비상호작용 텍스트. 없으면 null. */
  label: string | null;
  /** label이 없거나 같은 label이 여러 개일 때만 1부터 붙는다. */
  position: number | null;
  total: number;
}

export type AiTargetIdentification =
  | { level: 'clear' }
  | { level: 'assisted' | 'ambiguous'; reason: string };

function compactText(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length <= MAX_ELEMENT_NAME_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_ELEMENT_NAME_LENGTH - 1).trimEnd()}…`;
}

function labelledByText(element: Element): string | null {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (!labelledBy) return null;
  const text = labelledBy
    .split(/\s+/)
    .map((id) => element.ownerDocument.getElementById(id)?.textContent)
    .filter((value): value is string => Boolean(value))
    .join(' ');
  return compactText(text);
}

function associatedLabelText(element: Element): string | null {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
    return null;
  }
  return compactText(Array.from(element.labels ?? []).map((label) => label.textContent).join(' '));
}

function elementName(element: Element): string | null {
  return (
    compactText(element.getAttribute('aria-label')) ??
    labelledByText(element) ??
    associatedLabelText(element) ??
    compactText(element.textContent) ??
    (element instanceof HTMLInputElement ? compactText(element.value) : null)
  );
}

function implicitRole(element: Element): string | null {
  switch (element.tagName.toLowerCase()) {
    case 'button':
      return 'button';
    case 'a':
      return element.hasAttribute('href') ? 'link' : null;
    case 'select':
      return 'combobox';
    case 'textarea':
      return 'textbox';
    case 'input': {
      const type = (element.getAttribute('type') ?? 'text').toLowerCase();
      if (type === 'checkbox' || type === 'radio' || type === 'range') return type;
      if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
      return 'textbox';
    }
    default:
      return null;
  }
}

function componentPathFromFiber(fiber: Fiber | null): string[] {
  const nearestFirst: string[] = [];
  let current = fiber;
  while (current) {
    if (isCompositeFiber(current)) {
      const name = getDisplayName(current.type);
      if (name && name !== '(anonymous)' && nearestFirst[nearestFirst.length - 1] !== name) {
        nearestFirst.push(name);
      }
    }
    current = current.return;
  }

  // 실제 선택 컴포넌트 근처의 3개만 남긴다. App 같은 먼 루트보다 OrderSummary › CheckoutButton이
  // 코드 에이전트가 찾기에 더 유용하고, 전광판도 한 줄로 유지된다.
  return nearestFirst.reverse().slice(-MAX_COMPONENTS_IN_PATH);
}

function pagePathForElement(element: Element): string | null {
  const path = element.ownerDocument.defaultView?.location.pathname;
  // 루트 페이지는 별도 화면 문맥을 더하지 않아도 되고, 매 카드에 "/"를 넣으면 오히려 읽기만
  // 길어진다. 라우트가 있는 페이지에서만 페이지 식별자로 보강한다.
  return path && path !== '/' ? path : null;
}

function fiberName(fiber: Fiber): string | null {
  if (!isCompositeFiber(fiber)) return null;
  const name = getDisplayName(fiber.type);
  return name && name !== '(anonymous)' ? name : null;
}

function sameComponentType(a: Fiber, b: Fiber): boolean {
  // type identity가 우선이다. mock/래퍼 등으로 identity를 못 비교할 때만 displayName을 폴백으로
  // 쓴다. 이름만 같은 서로 다른 컴포넌트를 한 리스트로 오인하지 않기 위해서다.
  if (a.type === b.type) return true;
  const aName = fiberName(a);
  return aName !== null && aName === fiberName(b);
}

function siblingComponents(fiber: Fiber): Fiber[] {
  const parent = fiber.return;
  if (!parent) return [fiber];
  const siblings: Fiber[] = [];
  let current = parent.child;
  // 손상된/예상 밖 Fiber 연결이 대상 앱을 멈추게 하면 안 된다(architecture invariant #1).
  for (let seen = 0; current && seen < 10_000; current = current.sibling, seen++) {
    if (isCompositeFiber(current) && sameComponentType(current, fiber)) siblings.push(current);
  }
  return siblings;
}

function firstHostElement(fiber: Fiber): Element | null {
  const pending: Fiber[] = [];
  if (fiber.child) pending.push(fiber.child);
  let seen = 0;
  while (pending.length > 0 && seen++ < 10_000) {
    const current = pending.pop()!;
    if (current.stateNode instanceof Element) return current.stateNode;
    // stack은 LIFO라 sibling을 먼저 넣고 child를 나중에 넣어 render 순서의 첫 host를 찾는다.
    if (current.sibling) pending.push(current.sibling);
    if (current.child) pending.push(current.child);
  }
  return null;
}

function firstRepresentativeText(root: Element | null, selected: Element): string | null {
  if (!root) return null;
  const interactive = new Set(['a', 'button', 'input', 'select', 'textarea']);
  // 상품 카드·테이블 행에서 단순히 DOM 첫 텍스트를 고르면 가격/배지가 제목보다 먼저 나올 수
  // 있다. 개발자 주석이나 data-*를 요구하지 않고도 heading과 aria-label은 먼저 신뢰할 수 있다.
  const rootLabel = compactText(root.getAttribute('aria-label')) ?? labelledByText(root);
  if (rootLabel) return rootLabel;
  const semanticCandidates = [
    ...Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')),
    ...Array.from(root.querySelectorAll('[aria-label]')),
  ];
  for (const candidate of semanticCandidates) {
    if (candidate === selected || candidate.contains(selected) || candidate.getAttribute('aria-hidden') === 'true') continue;
    if (interactive.has(candidate.tagName.toLowerCase())) continue;
    const name = elementName(candidate);
    if (name) return name;
  }
  const visit = (node: Node): string | null => {
    if (node.nodeType === Node.TEXT_NODE) return compactText(node.textContent);
    if (!(node instanceof Element) || node === selected || node.getAttribute('aria-hidden') === 'true') return null;
    if (interactive.has(node.tagName.toLowerCase())) return null;
    for (const child of node.childNodes) {
      const text = visit(child);
      if (text) return text;
    }
    return null;
  };
  return visit(root);
}

function repeatedInstanceFromFiber(fiber: Fiber | null, selected: Element, selectedName: string | null): AiTargetInstance | null {
  if (!fiber) return null;
  const candidates: AiTargetInstance[] = [];
  let current: Fiber | null = fiber;

  while (current) {
    const componentName = fiberName(current);
    if (componentName) {
      const peers = siblingComponents(current);
      if (peers.length > 1) {
        const position = peers.indexOf(current) + 1;
        const labels = peers.map((peer) => firstRepresentativeText(firstHostElement(peer), selected));
        const label = labels[position - 1];
        const duplicateLabel = label === null || labels.filter((candidate) => candidate === label).length > 1;
        const instance = {
          componentName,
          label,
          position: duplicateLabel ? position : null,
          total: peers.length,
        };

        // Button처럼 카드 내부에 우연히 반복된 작은 컴포넌트는 그 버튼 이름만 다시 얻는다.
        // 선택 요소의 이름과 다른 대표 텍스트가 있는 반복 경계를 우선해 ProductCard/행까지 올라간다.
        if (label && label !== selectedName) return instance;
        candidates.push(instance);
      }
    }
    current = current.return;
  }

  // 대표 텍스트가 전혀 없는 반복 카드도 "2/9"는 제공한다. 가장 바깥 후보가 보통 item/card
  // 경계라, 안쪽 Button 같은 재사용 primitive보다 더 유용하다.
  return candidates.at(-1) ?? null;
}

/**
 * DOM 요소와 (선택적으로 이미 얻어둔) host Fiber에서 AI target card 데이터를 만든다.
 * Fiber가 없는 일반 DOM도 tag/name 정보만으로 정직하게 표현한다.
 */
export function createAiTarget(element: Element, fiber: Fiber | null = getFiberFromHostInstance(element)): AiTarget {
  const explicitRole = compactText(element.getAttribute('role'))?.split(/\s+/)[0] ?? null;
  const name = elementName(element);
  return {
    pagePath: pagePathForElement(element),
    componentPath: componentPathFromFiber(fiber),
    tagName: element.tagName.toLowerCase(),
    role: explicitRole ?? implicitRole(element),
    name,
    instance: repeatedInstanceFromFiber(fiber, element, name),
  };
}

/**
 * 복사문을 불필요하게 길게 만들지 않으면서, 순번처럼 약한 단서가 쓰였을 때만 전광판에 이유를
 * 설명한다. 이 상태는 screenshot/MCP를 자동 호출하지 않는다 — 사용자가 다음 행동을 고를 근거다.
 */
export function identifyAiTarget(target: AiTarget): AiTargetIdentification {
  const instance = target.instance ?? null;
  const hasTruncatedText = [target.name, instance?.label].some((value) => value?.endsWith('…'));

  if (!target.role && !target.name) {
    if (instance?.position) {
      return {
        level: 'ambiguous',
        reason: `요소 이름을 찾지 못했습니다. ${instance.componentName}의 ${instance.position}/${instance.total} 순번으로만 구분합니다.`,
      };
    }
    return { level: 'ambiguous', reason: '요소의 역할과 이름을 찾지 못했습니다.' };
  }
  if (instance?.position) {
    if (instance.label) {
      return {
        level: 'assisted',
        reason: `같은 "${instance.label}" 항목이 ${instance.total}개라 ${instance.position}/${instance.total} 순번을 함께 사용합니다.`,
      };
    }
    return {
      level: 'ambiguous',
      reason: `카드 제목을 찾지 못했습니다. ${instance.componentName}의 ${instance.position}/${instance.total} 순번으로만 구분합니다.`,
    };
  }
  if (hasTruncatedText) return { level: 'assisted', reason: '텍스트가 길어 일부를 줄여 표시했습니다.' };
  if (target.componentPath.length === 0) return { level: 'assisted', reason: 'React 컴포넌트 경로를 찾지 못했습니다.' };
  return { level: 'clear' };
}

/** 기본 복사문/전광판에 보일 한 줄. 빈 div는 억지 이름 대신 selected div라고 정직하게 말한다. */
export function formatAiTarget(target: AiTarget): string {
  const kind = target.role ?? target.tagName;
  const element = target.name ? `${kind} "${target.name}"` : `selected ${kind}`;
  const instance = target.instance;
  const componentPath = instance
    ? target.componentPath.map((name, index) => {
        const isNearestMatchingComponent = name === instance.componentName && index === target.componentPath.lastIndexOf(name);
        if (!isNearestMatchingComponent) return name;
        const details = [instance.label ? `"${instance.label}"` : null, instance.position ? `${instance.position}/${instance.total}` : null]
          .filter((value): value is string => value !== null)
          .join(', ');
        return details ? `${name} [${details}]` : name;
      })
    : target.componentPath;
  return [...(target.pagePath ? [target.pagePath] : []), ...componentPath, element].join(' › ');
}
