import { describe, expect, it } from 'vitest';
import { scrollIntoRail } from '../src/studio/scrollIntoRail';

/** A rail whose list sits at `navTop` and whose current link sits at `linkTop` on screen. */
function rail(navTop: number, linkTop: number) {
  const nav = document.createElement('nav');
  const link = document.createElement('a');
  nav.append(link);
  let scrollTop = 40;
  Object.defineProperty(nav, 'scrollTop', {
    get: () => scrollTop,
    set: (v: number) => (scrollTop = v),
  });
  nav.getBoundingClientRect = () => ({ top: navTop }) as DOMRect;
  link.getBoundingClientRect = () => ({ top: linkTop }) as DOMRect;
  return { nav, link };
}

describe('scrollIntoRail', () => {
  it('scrolls the outline so the current link is at its top', () => {
    const { nav, link } = rail(100, 460);
    scrollIntoRail(link);
    expect(nav.scrollTop).toBe(400);
  });

  it('does nothing when the link is gone or not in an outline', () => {
    expect(() => scrollIntoRail(null)).not.toThrow();
    expect(() => scrollIntoRail(document.createElement('a'))).not.toThrow();
  });
});
