import { describe, expect, it, vi } from 'vitest';
import type { Fiber } from 'bippy';

vi.mock('bippy', () => ({
  getDisplayName: vi.fn((type: { displayName?: string; name?: string } | string) =>
    typeof type === 'string' ? type : type.displayName ?? type.name ?? null,
  ),
  getFiberFromHostInstance: vi.fn(),
  isCompositeFiber: vi.fn((fiber: { composite?: boolean }) => fiber.composite === true),
}));

import { createAiTarget, formatAiTarget, identifyAiTarget } from './targetContext';

function composite(name: string, parent: Fiber | null = null): Fiber {
  return { composite: true, type: { name }, return: parent } as unknown as Fiber;
}

function host(parent: Fiber | null): Fiber {
  return { composite: false, type: 'div', return: parent } as unknown as Fiber;
}

function linkChildren(parent: Fiber, ...children: Fiber[]) {
  parent.child = children[0] ?? null;
  children.forEach((child, index) => {
    child.return = parent;
    child.sibling = children[index + 1] ?? null;
  });
}

function repeatedCard(name: string, key: string, productName: string, parent: Fiber): Fiber {
  const card = { composite: true, type: { name }, key, return: parent } as unknown as Fiber;
  const element = document.createElement('li');
  const title = document.createElement('span');
  title.textContent = productName;
  element.append(title);
  const rootHost = { composite: false, type: 'li', stateNode: element, return: card } as unknown as Fiber;
  linkChildren(card, rootHost);
  return card;
}

describe('createAiTarget', () => {
  it('combines a nearest Fiber component path with a native button name', () => {
    const app = composite('App');
    const summary = composite('OrderSummary', app);
    const checkout = composite('CheckoutButton', summary);
    const button = document.createElement('button');
    button.textContent = '결제하기';

    expect(createAiTarget(button, host(checkout))).toEqual({
      componentPath: ['App', 'OrderSummary', 'CheckoutButton'],
      pagePath: null,
      tagName: 'button',
      role: 'button',
      name: '결제하기',
      instance: null,
    });
  });

  it('keeps the three closest named components instead of an overlong root path', () => {
    const root = composite('Root');
    const app = composite('App', root);
    const page = composite('CheckoutPage', app);
    const summary = composite('OrderSummary', page);
    const price = composite('PriceSummary', summary);
    const div = document.createElement('div');

    expect(createAiTarget(div, host(price)).componentPath).toEqual(['CheckoutPage', 'OrderSummary', 'PriceSummary']);
  });

  it('uses explicit aria role and label before visible text', () => {
    const div = document.createElement('div');
    div.setAttribute('role', 'button');
    div.setAttribute('aria-label', '장바구니 열기');
    div.textContent = '무시할 텍스트';

    expect(createAiTarget(div, null)).toMatchObject({ tagName: 'div', role: 'button', name: '장바구니 열기' });
  });

  it('returns an honest selected div description when an element has no semantic name', () => {
    expect(formatAiTarget(createAiTarget(document.createElement('div'), null))).toBe('selected div');
  });

  it('adds the repeated card\'s representative text, not a fragile global button number', () => {
    const grid = composite('ProductGrid');
    const linen = repeatedCard('ProductCard', 'linen-shirt', '리넨 셔츠', grid);
    const denim = repeatedCard('ProductCard', 'wide-denim', '와이드 데님', grid);
    linkChildren(grid, linen, denim);
    const buttonComponent = composite('Button', linen);
    const button = document.createElement('button');
    button.textContent = '담기';

    const target = createAiTarget(button, host(buttonComponent));

    expect(target.instance).toEqual({ componentName: 'ProductCard', label: '리넨 셔츠', position: null, total: 2 });
    expect(formatAiTarget(target)).toBe('ProductGrid › ProductCard ["리넨 셔츠"] › Button › button "담기"');
  });

  it('adds a scoped ordinal only when repeated cards have the same representative text', () => {
    const grid = composite('ProductGrid');
    const first = repeatedCard('ProductCard', 'first', '상품 준비 중', grid);
    const second = repeatedCard('ProductCard', 'second', '상품 준비 중', grid);
    linkChildren(grid, first, second);
    const buttonComponent = composite('Button', second);
    const button = document.createElement('button');
    button.textContent = '담기';

    const target = createAiTarget(button, host(buttonComponent));

    expect(target.instance).toEqual({ componentName: 'ProductCard', label: '상품 준비 중', position: 2, total: 2 });
    expect(formatAiTarget(target)).toContain('ProductCard ["상품 준비 중", 2/2]');
    expect(identifyAiTarget(target)).toEqual({
      level: 'assisted',
      reason: '같은 "상품 준비 중" 항목이 2개라 2/2 순번을 함께 사용합니다.',
    });
  });

  it('prefers a heading over an earlier non-semantic card text', () => {
    const grid = composite('ProductGrid');
    const first = repeatedCard('ProductCard', 'first', '42,000원', grid);
    const second = repeatedCard('ProductCard', 'second', '58,000원', grid);
    for (const [card, title] of [[first, '리넨 셔츠'], [second, '와이드 데님']] as const) {
      const root = card.child!.stateNode as HTMLLIElement;
      const heading = document.createElement('h3');
      heading.textContent = title;
      root.append(heading);
    }
    linkChildren(grid, first, second);
    const buttonComponent = composite('Button', second);
    const button = document.createElement('button');
    button.textContent = '담기';

    expect(createAiTarget(button, host(buttonComponent)).instance).toMatchObject({ label: '와이드 데님' });
  });

  it('reports an ambiguous unnamed div instead of pretending it is uniquely identified', () => {
    expect(identifyAiTarget(createAiTarget(document.createElement('div'), null))).toEqual({
      level: 'ambiguous',
      reason: '요소의 역할과 이름을 찾지 못했습니다.',
    });
  });

  it('formats Fiber and element context as one short target line', () => {
    expect(
      formatAiTarget({
        componentPath: ['OrderSummary', 'CheckoutButton'],
        tagName: 'button',
        role: 'button',
        name: '결제하기',
        instance: null,
      }),
    ).toBe('OrderSummary › CheckoutButton › button "결제하기"');
  });

  it('prepends a non-root page path but omits query parameters and hashes', () => {
    const previousUrl = window.location.href;
    window.history.replaceState(null, '', '/shop?category=shoes#catalog');

    const target = createAiTarget(document.createElement('button'), null);

    expect(target.pagePath).toBe('/shop');
    expect(
      formatAiTarget({
        pagePath: target.pagePath,
        componentPath: ['ProductGrid', 'ProductCard', 'Button'],
        tagName: 'button',
        role: 'button',
        name: '담기',
      }),
    ).toBe('/shop › ProductGrid › ProductCard › Button › button "담기"');
    window.history.replaceState(null, '', previousUrl);
  });
});
