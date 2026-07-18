// 노드의 "구조적 역할" 경계(도형 어휘, ADR-0028) — 포탈/Suspense/에러 바운더리.
//
// 표현 방식(사용자 결정): 노드에 아이콘 뱃지를 붙이는 대신, 경계가 감싸는 노드들을 "이름표 붙은
// 프레임"으로 두른다("이 박스 안은 전부 이 경계 아래"라는 멘탈 모델과 일치 — React DevTools가
// Suspense를 이름 노드로 보여주는 것과 같은 결). 그래서 이 모듈은 "각 노드가 어느 경계 인스턴스에
// 속하는가"(경계 소속)를 파생하고, boundaryFrames.ts가 그 소속으로 프레임 하나씩을 만든다.
//
// 핵심(실측, ADR-0035): RenderNode 스키마를 안 건드리고 fibersById 사이드채널(id→Fiber,
// ADR-0026)만으로 파생 가능하다. 포탈/Suspense fiber는 노드로 안 만들어져도 원본 fiber 트리엔
// 남아 있어, 트리를 한 번 훑으며 "경계 스택"을 들고 내려가면 각 kept 노드의 소속 경계를 알 수 있다.
import { getFiberId, type Fiber } from 'bippy';

export type RoleMarker = 'portal' | 'suspense' | 'errorBoundary';

export interface BoundaryMembership {
  kind: RoleMarker;
  /** 이 경계 인스턴스의 안정된 id(경계 fiber의 getFiberId). 같은 경계에 속한 노드끼리 묶어 프레임 1개로 만든다. */
  boundaryId: number;
}

// React fiber tag 상수(실측 확인). HostPortal=4, SuspenseComponent=13, ClassComponent=1.
const HOST_PORTAL_TAG = 4;
const SUSPENSE_TAG = 13;
const CLASS_COMPONENT_TAG = 1;
// 보드에 노드로 그려지는(kept) fiber tag — bippy isHostFiber(5/26/27) + isCompositeFiber(0/1/11/14/15).
const KEPT_TAGS = new Set([0, 1, 5, 11, 14, 15, 26, 27]);

/** class 컴포넌트가 에러 바운더리인지 — 공개 라이프사이클 존재로 판별(내부 tag 불필요, 안정적). */
export function isErrorBoundaryType(fiber: Fiber): boolean {
  if (fiber.tag !== CLASS_COMPONENT_TAG) return false;
  const type = fiber.type as
    | { prototype?: { componentDidCatch?: unknown }; getDerivedStateFromError?: unknown }
    | null
    | undefined;
  if (!type) return false;
  return (
    typeof type.prototype?.componentDidCatch === 'function' ||
    typeof type.getDerivedStateFromError === 'function'
  );
}

function boundaryKind(fiber: Fiber): RoleMarker | undefined {
  if (fiber.tag === HOST_PORTAL_TAG) return 'portal';
  if (fiber.tag === SUSPENSE_TAG) return 'suspense';
  if (isErrorBoundaryType(fiber)) return 'errorBoundary';
  return undefined;
}

/**
 * 원본 fiber 트리를 한 번 훑어(임의의 fiber에서 루트까지 올라간 뒤 내려가며) 각 kept 노드의
 * "가장 안쪽 경계 소속"을 파생한다. 경계 스택을 들고 내려가므로 노드당 비용이 아니라 트리 전체
 * O(fiber 수) 1회다(노드마다 .return을 매번 올라가는 것보다 싸다). 스택 기반 반복 순회라 깊은
 * 트리에서도 재귀 오버플로가 없다(serialize.ts와 같은 방어).
 *
 * 소속 규칙: 아래로 내려가며 포탈/Suspense/에러바운더리 fiber를 만나면 그 아래 전체가 그 경계
 * 소속이 된다(가장 안쪽 경계가 이긴다 — 중첩 시 안쪽으로 덮어씀). 에러 바운더리는 그 노드
 * 자신도 소속에 포함해 "경계+보호 영역"을 한 프레임으로 묶는다.
 */
export function deriveBoundaryMemberships(anyFiber: Fiber | undefined | null): Map<number, BoundaryMembership> {
  const result = new Map<number, BoundaryMembership>();
  if (!anyFiber) return result;
  let root: Fiber = anyFiber;
  while (root.return) root = root.return;

  const stack: { fiber: Fiber; boundary: BoundaryMembership | undefined }[] = [
    { fiber: root, boundary: undefined },
  ];
  while (stack.length) {
    const { fiber, boundary } = stack.pop()!;
    const kind = boundaryKind(fiber);
    const current: BoundaryMembership | undefined = kind
      ? { kind, boundaryId: getFiberId(fiber) }
      : boundary;
    if (current && KEPT_TAGS.has(fiber.tag)) result.set(getFiberId(fiber), current);
    let child: Fiber | null = fiber.child;
    while (child) {
      stack.push({ fiber: child, boundary: current });
      child = child.sibling;
    }
  }
  return result;
}
