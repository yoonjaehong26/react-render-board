import { describe, it, expect } from 'vitest';
import { computeSearchMatches } from './search';
import { PENDING_GROUP } from './normalize';
import type { VisibleNode } from './normalize';

function vnode(id: number, displayName: string, group: string): VisibleNode {
  return { id, displayName, kind: 'composite', parentId: null, group, isAnonymous: false };
}

describe('computeSearchMatches', () => {
  it('returns an empty set for an empty or whitespace-only query', () => {
    const nodes = [vnode(1, 'Button', 'domains/shared')];
    expect(computeSearchMatches(nodes, '')).toEqual(new Set());
    expect(computeSearchMatches(nodes, '   ')).toEqual(new Set());
  });

  it('matches displayName case-insensitively as a substring', () => {
    const nodes = [vnode(1, 'CheckoutPanel', 'domains/checkout'), vnode(2, 'Button', 'domains/shared')];
    expect(computeSearchMatches(nodes, 'checkout')).toEqual(new Set([1]));
    expect(computeSearchMatches(nodes, 'CHECKOUT')).toEqual(new Set([1]));
  });

  it('also matches the resolved group string, catching every member of a domain', () => {
    const nodes = [
      vnode(1, 'CheckoutPanel', 'domains/checkout/CheckoutPanel.tsx'),
      vnode(2, 'Button', 'domains/checkout/CheckoutPanel.tsx'),
      vnode(3, 'AppShell', 'domains/shell/AppShell.tsx'),
    ];
    expect(computeSearchMatches(nodes, 'checkout')).toEqual(new Set([1, 2]));
  });

  it('excludes PENDING_GROUP from group-text matching so its sentinel string never spuriously matches', () => {
    const nodes = [vnode(1, 'Mystery', PENDING_GROUP)];
    expect(computeSearchMatches(nodes, 'pending')).toEqual(new Set());
  });

  it('still matches a pending node by displayName', () => {
    const nodes = [vnode(1, 'MysteryComponent', PENDING_GROUP)];
    expect(computeSearchMatches(nodes, 'mystery')).toEqual(new Set([1]));
  });

  it('returns an empty set when nothing matches', () => {
    const nodes = [vnode(1, 'Button', 'domains/shared')];
    expect(computeSearchMatches(nodes, 'zzz')).toEqual(new Set());
  });
});
