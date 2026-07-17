import { describe, it, expect } from 'vitest';
import { isLibraryInternalHint, resolveEffectiveGroups, PENDING_GROUP } from './groups';
import type { RenderNode } from '../../data/types';

function node(
  id: number,
  kind: RenderNode['kind'],
  parentId: number | null,
  groupHint: string | null,
): RenderNode {
  return { id, displayName: `Node${id}`, kind, parentId, groupHint };
}

describe('isLibraryInternalHint', () => {
  it('flags node_modules paths', () => {
    expect(isLibraryInternalHint('node_modules/react/index.js')).toBe(true);
  });

  it('flags node_modules as a nested path segment', () => {
    expect(isLibraryInternalHint('a/node_modules/foo/index.js')).toBe(true);
  });

  it('flags node_modules with backslash separators', () => {
    expect(isLibraryInternalHint('node_modules\\react\\index.js')).toBe(true);
  });

  it('does not flag plain app filenames', () => {
    expect(isLibraryInternalHint('App.tsx')).toBe(false);
    expect(isLibraryInternalHint('domains/checkout/CheckoutPanel.tsx')).toBe(false);
  });

  // ADR-0019 regression: Vite's dependency pre-bundle cache sourcemaps drop the
  // `node_modules` segment entirely and instead climb out with `../`.
  it('flags parent-directory-escaping paths from Vite pre-bundle sourcemaps', () => {
    expect(isLibraryInternalHint('../../@radix-ui/react-dropdown-menu/dist/index.mjs')).toBe(true);
    expect(isLibraryInternalHint('../../@mui/material/esm/styles/ThemeProvider.js')).toBe(true);
  });

  it('flags parent-directory-escaping paths with backslash separators', () => {
    expect(isLibraryInternalHint('..\\..\\@radix-ui\\foo.js')).toBe(true);
  });

  it('does not flag relative paths that stay within the source root', () => {
    expect(isLibraryInternalHint('./shared/Button.tsx')).toBe(false);
    expect(isLibraryInternalHint('Button.tsx')).toBe(false);
  });
});

describe('resolveEffectiveGroups', () => {
  it('uses a composite node own valid groupHint directly', () => {
    const nodes = [node(1, 'composite', null, 'App.tsx')];
    const groups = resolveEffectiveGroups(nodes);
    expect(groups.get(1)).toBe('App.tsx');
  });

  it('a host node inherits its group from the nearest resolved ancestor', () => {
    const nodes = [
      node(1, 'composite', null, 'App.tsx'),
      node(2, 'host', 1, null),
    ];
    const groups = resolveEffectiveGroups(nodes);
    expect(groups.get(2)).toBe('App.tsx');
  });

  it('a composite node with a pending (null) groupHint inherits from the nearest resolved ancestor', () => {
    const nodes = [
      node(1, 'composite', null, 'App.tsx'),
      node(2, 'composite', 1, null),
    ];
    const groups = resolveEffectiveGroups(nodes);
    expect(groups.get(2)).toBe('App.tsx');
  });

  // ADR-0012/0019 absorption: a library-internal composite (e.g. Radix rendering
  // its own internals under an app's trigger component) is treated as unresolved
  // and climbs to the nearest app-source ancestor instead of forming its own group.
  it('absorbs a composite whose groupHint is library-internal into the nearest app-source ancestor', () => {
    const nodes = [
      node(1, 'composite', null, 'DropdownMenuTrigger.tsx'),
      node(2, 'composite', 1, '../../@radix-ui/react-dropdown-menu/dist/index.mjs'),
      node(3, 'host', 2, null),
    ];
    const groups = resolveEffectiveGroups(nodes);
    expect(groups.get(2)).toBe('DropdownMenuTrigger.tsx');
    expect(groups.get(3)).toBe('DropdownMenuTrigger.tsx');
  });

  // Documented "known fallback" (groups.ts comment, ADR-0012/0019): this only
  // triggers when the *true tree root* itself carries the library hint — a
  // non-root composite's own library hint is never consulted, it always defers
  // to resolve(parentId) instead. See docs/decisions/0019.
  it('falls back to a library hint at the tree root when no ancestor has an app-source group', () => {
    const nodes = [
      node(1, 'composite', null, '../../@mui/material/esm/styles/Button.js'),
      node(2, 'composite', 1, null),
      node(3, 'host', 2, null),
    ];
    const groups = resolveEffectiveGroups(nodes);
    const libraryHint = '../../@mui/material/esm/styles/Button.js';
    expect(groups.get(1)).toBe(libraryHint);
    expect(groups.get(2)).toBe(libraryHint);
    expect(groups.get(3)).toBe(libraryHint);
  });

  it('falls back to PENDING_GROUP when there is no groupHint anywhere in the ancestor chain', () => {
    const nodes = [
      node(1, 'composite', null, null),
      node(2, 'host', 1, null),
    ];
    const groups = resolveEffectiveGroups(nodes);
    expect(groups.get(1)).toBe(PENDING_GROUP);
    expect(groups.get(2)).toBe(PENDING_GROUP);
  });

  it('resolves group inheritance end-to-end across a multi-level tree', () => {
    const nodes = [
      node(1, 'composite', null, 'domains/checkout/CheckoutPanel.tsx'),
      node(2, 'composite', 1, null), // pending async resolution
      node(3, 'composite', 2, '../../@radix-ui/foo.js'), // library-internal, absorbed
      node(4, 'host', 3, null),
      node(5, 'host', 4, null), // host under host
      node(6, 'composite', 5, 'domains/checkout/SubPanel.tsx'), // new app-source group deeper in the tree
      node(7, 'host', 6, null),
    ];
    const groups = resolveEffectiveGroups(nodes);

    expect(groups.size).toBe(nodes.length);
    expect(groups.get(1)).toBe('domains/checkout/CheckoutPanel.tsx');
    expect(groups.get(2)).toBe('domains/checkout/CheckoutPanel.tsx');
    expect(groups.get(3)).toBe('domains/checkout/CheckoutPanel.tsx');
    expect(groups.get(4)).toBe('domains/checkout/CheckoutPanel.tsx');
    expect(groups.get(5)).toBe('domains/checkout/CheckoutPanel.tsx');
    expect(groups.get(6)).toBe('domains/checkout/SubPanel.tsx');
    expect(groups.get(7)).toBe('domains/checkout/SubPanel.tsx');
  });

  it('returns PENDING_GROUP for a node whose parentId reference is missing from the input', () => {
    const nodes = [node(2, 'host', 999, null)];
    const groups = resolveEffectiveGroups(nodes);
    expect(groups.get(2)).toBe(PENDING_GROUP);
  });
});
