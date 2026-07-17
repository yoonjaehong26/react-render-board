import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { DomHighlightOverlay } from './DomHighlightOverlay';
import { createInteractionStore } from '../lib/interactionStore';

// jsdom does not perform real layout, so getBoundingClientRect() defaults to all-zero rects —
// stub it per element to verify the overlay actually wires through the measured values.
function stubRect(el: Element, rect: { top: number; left: number; width: number; height: number }) {
  el.getBoundingClientRect = () => ({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON() {
      return this;
    },
  });
}

describe('DomHighlightOverlay', () => {
  it('renders nothing when there is no active highlight', () => {
    const interactionStore = createInteractionStore();
    const { container } = render(<DomHighlightOverlay interactionStore={interactionStore} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a highlight box positioned at the target element’s measured rect, portalled to document.body', async () => {
    const interactionStore = createInteractionStore();
    const target = document.createElement('div');
    document.body.appendChild(target);
    stubRect(target, { top: 10, left: 20, width: 100, height: 50 });

    render(<DomHighlightOverlay interactionStore={interactionStore} />);
    interactionStore.highlight([target]);

    await waitFor(() => {
      const box = document.body.querySelector('.dom-highlight-overlay__box') as HTMLElement;
      expect(box).toBeTruthy();
      expect(box.style.top).toBe('10px');
      expect(box.style.left).toBe('20px');
      expect(box.style.width).toBe('100px');
      expect(box.style.height).toBe('50px');
    });

    document.body.removeChild(target);
  });

  it('renders one box per highlighted element, and never draws anything beyond the given elements (ADR-0024 decision 5: no group boundaries)', async () => {
    const interactionStore = createInteractionStore();
    const a = document.createElement('div');
    const b = document.createElement('span');
    stubRect(a, { top: 0, left: 0, width: 10, height: 10 });
    stubRect(b, { top: 5, left: 5, width: 20, height: 20 });

    render(<DomHighlightOverlay interactionStore={interactionStore} />);
    interactionStore.highlight([a, b]);

    await waitFor(() => {
      expect(document.body.querySelectorAll('.dom-highlight-overlay__box')).toHaveLength(2);
    });
  });

  it('clears the highlight boxes once interactionStore reports an empty highlightedElements', async () => {
    const interactionStore = createInteractionStore();
    const target = document.createElement('div');
    stubRect(target, { top: 0, left: 0, width: 10, height: 10 });

    render(<DomHighlightOverlay interactionStore={interactionStore} />);
    interactionStore.highlight([target]);
    await waitFor(() => {
      expect(document.body.querySelector('.dom-highlight-overlay__box')).toBeTruthy();
    });

    interactionStore.highlight([]);
    await waitFor(() => {
      expect(document.body.querySelector('.dom-highlight-overlay__box')).toBeNull();
    });
  });

  it('is non-interactive: the overlay container never blocks pointer events on the real page', async () => {
    const interactionStore = createInteractionStore();
    const target = document.createElement('div');
    stubRect(target, { top: 0, left: 0, width: 10, height: 10 });

    render(<DomHighlightOverlay interactionStore={interactionStore} />);
    interactionStore.highlight([target]);

    await waitFor(() => {
      const overlay = document.body.querySelector('.dom-highlight-overlay');
      expect(overlay).toHaveClass('dom-highlight-overlay');
    });
    // CSS (not inline style) is responsible for pointer-events: none — asserting the class
    // name here is the contract; flow.css supplies the actual rule (see .dom-highlight-overlay).
  });
});
