import { describe, it, expect } from 'vitest';
import { getFiberId, type Fiber } from 'bippy';
import { deriveBoundaryMemberships, isErrorBoundaryType } from './roleMarkers';

// 최소 mock fiber 트리 빌더 — tag/type/child/sibling/return만 채운다.
function fib(tag: number, type: unknown = null): Fiber {
  return { tag, type, child: null, sibling: null, return: null } as unknown as Fiber;
}
function children(parent: Fiber, kids: Fiber[]): Fiber {
  let prev: Fiber | null = null;
  for (const c of kids) {
    (c as { return: Fiber }).return = parent;
    if (prev) (prev as { sibling: Fiber }).sibling = c;
    else (parent as { child: Fiber }).child = c;
    prev = c;
  }
  return parent;
}

const EB_TYPE = { getDerivedStateFromError: () => ({}) };

// 태그: HostRoot=3, Function=0, Host=5, Class=1, HostPortal=4, Suspense=13.
describe('isErrorBoundaryType', () => {
  it('detects via static getDerivedStateFromError and prototype.componentDidCatch', () => {
    expect(isErrorBoundaryType(fib(1, EB_TYPE))).toBe(true);
    class B {
      componentDidCatch() {}
    }
    expect(isErrorBoundaryType(fib(1, B))).toBe(true);
  });
  it('is false for non-class or plain class', () => {
    expect(isErrorBoundaryType(fib(0, EB_TYPE))).toBe(false); // function component
    class Plain {}
    expect(isErrorBoundaryType(fib(1, Plain))).toBe(false);
  });
});

describe('deriveBoundaryMemberships', () => {
  it('returns an empty map for a missing fiber', () => {
    expect(deriveBoundaryMemberships(undefined).size).toBe(0);
    expect(deriveBoundaryMemberships(null).size).toBe(0);
  });

  it('assigns each kept node under a boundary to that boundary, grouping siblings by instance', () => {
    const lazyView = fib(0);
    const row = fib(5);
    const suspense = children(fib(13), [children(lazyView, [row])]);
    const modal = fib(0);
    const portal = children(fib(4), [modal]);
    const faulty = fib(0);
    const boundary = children(fib(1, EB_TYPE), [faulty]);
    const app = children(fib(0), [suspense, portal, boundary]);
    const root = children(fib(3), [app]);

    // 임의의 노드(row)에서 시작해도 루트까지 올라가 전체를 훑는다.
    const map = deriveBoundaryMemberships(row);

    expect(map.get(getFiberId(lazyView))?.kind).toBe('suspense');
    expect(map.get(getFiberId(row))?.kind).toBe('suspense');
    // 같은 Suspense 인스턴스에 속한 두 노드는 boundaryId가 같다(→ 프레임 1개).
    expect(map.get(getFiberId(row))?.boundaryId).toBe(map.get(getFiberId(lazyView))?.boundaryId);

    expect(map.get(getFiberId(modal))?.kind).toBe('portal');
    // 에러 바운더리는 자신도 소속에 포함(경계+보호영역을 한 프레임으로).
    expect(map.get(getFiberId(boundary))?.kind).toBe('errorBoundary');
    expect(map.get(getFiberId(faulty))?.kind).toBe('errorBoundary');
    expect(map.get(getFiberId(faulty))?.boundaryId).toBe(map.get(getFiberId(boundary))?.boundaryId);

    // 경계 밖 노드(app, root)는 소속 없음.
    expect(map.has(getFiberId(app))).toBe(false);
    expect(map.has(getFiberId(root))).toBe(false);

    // 배관(HostRoot 등)은 kept가 아니라 소속 맵에 안 담긴다.
    expect(map.size).toBe(5); // lazyView, row, modal, boundary, faulty
  });

  it('lets the innermost boundary win when boundaries are nested', () => {
    const leaf = fib(0);
    const innerSuspense = children(fib(13), [leaf]);
    const outerBoundary = children(fib(1, EB_TYPE), [innerSuspense]);
    const root = children(fib(3), [outerBoundary]);

    const map = deriveBoundaryMemberships(root);
    // leaf는 가장 안쪽 경계(Suspense)에 속한다.
    expect(map.get(getFiberId(leaf))?.kind).toBe('suspense');
    // 바깥 에러 바운더리 노드 자신은 여전히 errorBoundary.
    expect(map.get(getFiberId(outerBoundary))?.kind).toBe('errorBoundary');
  });
});
