// props 흐름 추적 + 변경 감지의 순수 로직 (ADR-0032, 데이터 스코프 확장 1단계).
//
// 이 모듈은 RenderNode 스키마(architecture.md가 "되돌리기 어려운"으로 고정)를 전혀 건드리지
// 않는다 — bippy Fiber의 memoizedProps(+alternate)를 클릭 시점에 imperative하게 읽어
// 표시/추적할 뿐이다(ADR-0026의 fibersById 보조 채널과 같은 구조). 커밋마다 전체 노드를
// 순회하는 비용은 없다: 패널 읽기는 선택된 노드 1개에 대해 O(1), 참조 추적은 클릭한 노드의
// 자손 수에 비례해 클릭당 1회다.
import type { Fiber } from 'bippy';
import type { RenderNode } from '../../data/types';

/** 값의 대략적 종류 — props 패널이 우선순위/스타일을 정하는 데 쓴다. */
export type PropValueKind = 'nullish' | 'primitive' | 'array' | 'object' | 'function' | 'element';

export interface PropRow {
  key: string;
  /** 얕은 값 미리보기(깊은 직렬화 안 함, ADR-0032). */
  preview: string;
  kind: PropValueKind;
  /** 참조 동일성 추적이 의미 있는 값인가(객체/배열/콜백). primitive/React element/nullish는 false. */
  trackable: boolean;
  /** 이번 커밋에 이전 렌더 대비 참조가 바뀌었는가(b1: memoizedProps vs alternate.memoizedProps). */
  changed: boolean;
}

const PREVIEW_MAX = 42;

function truncate(s: string): string {
  return s.length > PREVIEW_MAX ? `${s.slice(0, PREVIEW_MAX - 1)}…` : s;
}

function isReactElement(value: object): boolean {
  const tag = (value as { $$typeof?: symbol }).$$typeof;
  return tag === Symbol.for('react.element') || tag === Symbol.for('react.transitional.element');
}

function elementTypeName(value: object): string {
  const type = (value as { type?: unknown }).type;
  if (typeof type === 'string') return type;
  if (typeof type === 'function') {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName || fn.name || 'Component';
  }
  return 'Element';
}

/** 얕은 미리보기 + 종류 + 추적 가능 여부를 한 번에 계산한다(값을 두 번 검사하지 않도록). */
export function describeValue(value: unknown): { kind: PropValueKind; preview: string; trackable: boolean } {
  if (value === null) return { kind: 'nullish', preview: 'null', trackable: false };
  if (value === undefined) return { kind: 'nullish', preview: 'undefined', trackable: false };

  const t = typeof value;
  if (t === 'string') return { kind: 'primitive', preview: truncate(JSON.stringify(value)), trackable: false };
  if (t === 'number' || t === 'boolean') return { kind: 'primitive', preview: String(value), trackable: false };
  if (t === 'bigint') return { kind: 'primitive', preview: `${value as bigint}n`, trackable: false };
  if (t === 'symbol') return { kind: 'primitive', preview: String(value as symbol), trackable: false };
  if (t === 'function') {
    const fn = value as { displayName?: string; name?: string };
    return { kind: 'function', preview: `ƒ ${fn.displayName || fn.name || 'anonymous'}()`, trackable: true };
  }

  // 객체 계열
  const obj = value as object;
  if (isReactElement(obj)) {
    // React element는 참조 추적 대상에서 뺀다 — children으로 흔히 들어오고, 자손이 부모의
    // children element를 자기 prop으로 다시 갖는 일은 거의 없어 추적이 노이즈만 만든다.
    return { kind: 'element', preview: `<${elementTypeName(obj)} />`, trackable: false };
  }
  if (Array.isArray(obj)) {
    return { kind: 'array', preview: `Array(${obj.length})`, trackable: true };
  }
  const ctor = obj.constructor;
  if (ctor && ctor !== Object && typeof ctor === 'function' && ctor.name) {
    return { kind: 'object', preview: truncate(`${ctor.name} {…}`), trackable: true };
  }
  const keys = Object.keys(obj);
  const shown = keys.slice(0, 3).join(', ');
  const preview = keys.length === 0 ? '{}' : `{ ${shown}${keys.length > 3 ? ', …' : ''} }`;
  return { kind: 'object', preview: truncate(preview), trackable: true };
}

/** 참조 추적이 의미 있는 값인가(객체/배열/콜백). Canvas의 추적 트리거 게이트로도 쓴다. */
export function isTrackable(value: unknown): boolean {
  return describeValue(value).trackable;
}

function propsRecord(fiber: Fiber): Record<string, unknown> | null {
  const props = fiber.memoizedProps;
  return props && typeof props === 'object' ? (props as Record<string, unknown>) : null;
}

/**
 * 이번 커밋에 이 fiber의 props가 (얕은 참조 기준으로) 하나라도 바뀌었는가.
 * b1(ADR-0032): memoizedProps vs alternate.memoizedProps. alternate가 없으면(최초 마운트)
 * "바뀜"으로 치지 않는다. afterglow 변경 감지와 패널의 per-key 변경 표시가 이걸 공유한다.
 */
export function fiberPropsChanged(fiber: Fiber): boolean {
  const current = propsRecord(fiber);
  const alt = fiber.alternate ? propsRecord(fiber.alternate) : null;
  if (!current || !alt) return false;
  const keys = new Set([...Object.keys(current), ...Object.keys(alt)]);
  for (const k of keys) {
    if (!Object.is(current[k], alt[k])) return true;
  }
  return false;
}

/**
 * 선택된 노드의 fiber에서 props 패널용 우선순위 정렬 리스트를 만든다(태그 구름 아님, ADR-0032).
 * 정렬 규칙: 변경된 prop을 맨 위 → 추적 가능(객체/콜백) → primitive 아래로. 같은 등급 안에서는
 * 키 알파벳순으로 안정 정렬한다. 값은 얕은 미리보기만(깊은 직렬화 안 함).
 */
export function readFiberProps(fiber: Fiber): PropRow[] {
  const current = propsRecord(fiber);
  if (!current) return [];
  const alt = fiber.alternate ? propsRecord(fiber.alternate) : null;

  const rows: PropRow[] = Object.keys(current).map((key) => {
    const value = current[key];
    const { kind, preview, trackable } = describeValue(value);
    const changed = alt ? !Object.is(value, alt[key]) : false;
    return { key, preview, kind, trackable, changed };
  });

  const rank = (r: PropRow) => (r.changed ? 0 : r.trackable ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
}

/**
 * 이 fiber가 이번 커밋에 받은 "대표로 바뀐 prop 키"를 고른다(ADR-0032, 흐름 간선 라벨용).
 * 추적 가능한(객체/콜백) 변경 prop을 우선하고(진짜 드릴링되는 건 그쪽), 없으면 첫 변경 prop.
 * 바뀐 게 없거나(alternate 없음/동일) props가 없으면 undefined. 흐름 간선 하나당 O(props)로 싸다.
 */
export function representativeChangedProp(fiber: Fiber): string | undefined {
  const current = propsRecord(fiber);
  const alt = fiber.alternate ? propsRecord(fiber.alternate) : null;
  if (!current || !alt) return undefined;
  let firstChanged: string | undefined;
  for (const key in current) {
    if (Object.is(current[key], alt[key])) continue;
    if (describeValue(current[key]).trackable) return key; // 추적 가능한 변경 prop 우선
    firstChanged ??= key;
  }
  return firstChanged;
}

/**
 * prop 클릭 → 참조 동일성 흐름 추적(ADR-0032 3층). 클릭한 노드의 자손(기존 parentId 트리)을
 * 훑어 memoizedProps에 `ref`와 "같은 참조"(Object.is)를 top-level로 가진 노드 id를 모은다.
 * props는 렌더 트리를 따라 흐르므로 경로가 곧 기존 트리의 서브체인이다 — 새 간선도 배선도
 * 필요 없다. 루트 자신은 포함하지 않는다(선택 노드는 별도로 표시됨).
 *
 * @param nodes 원본 RenderNode 트리(parentId 기준). host/composite 모두 포함한 raw 트리.
 * @param rootId 클릭한(추적 시작) 노드 id.
 * @param ref 추적할 참조(호출부가 isTrackable로 이미 걸렀다고 가정 — primitive면 무의미).
 * @param getFiber id → 최신 커밋 Fiber(store.getFiber). 자손별 memoizedProps를 읽는다.
 */
export function trackReferenceInDescendants(
  nodes: RenderNode[],
  rootId: number,
  ref: unknown,
  getFiber: (id: number) => Fiber | undefined,
): Set<number> {
  const childrenByParent = new Map<number, number[]>();
  for (const n of nodes) {
    if (n.parentId === null) continue;
    const arr = childrenByParent.get(n.parentId);
    if (arr) arr.push(n.id);
    else childrenByParent.set(n.parentId, [n.id]);
  }

  const matched = new Set<number>();
  const seen = new Set<number>();
  const stack = [...(childrenByParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue; // 순환 방어(정상 트리엔 없지만 serialize.ts와 같은 대비)
    seen.add(id);

    const fiber = getFiber(id);
    if (fiber) {
      const props = propsRecord(fiber);
      if (props) {
        for (const key in props) {
          if (Object.is(props[key], ref)) {
            matched.add(id);
            break;
          }
        }
      }
    }

    const kids = childrenByParent.get(id);
    if (kids) for (const k of kids) stack.push(k);
  }
  return matched;
}
