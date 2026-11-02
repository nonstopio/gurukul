import { encodeBlurHash } from '@gurukul/schema';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageFigure, blurHashStyle } from '../src';
import { axeViolations } from './axe';

const SRC = 'https://x.test/a.png';
/** A 4 x 4 solid orange picture: its hash decodes to orange. */
const HASH = encodeBlurHash(
  Uint8ClampedArray.from({ length: 64 }, (_, i) => [230, 120, 20, 255][i % 4] as number),
  4,
  4,
);

/** jsdom has no canvas: a stub that records what is drawn and hands back a fixed address. */
function stubCanvas(context: object | null = {}) {
  const put = vi.fn();
  const fake = {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: put,
    ...context,
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() =>
    context === null ? null : fake) as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
  return put;
}
const blurOf = (container: HTMLElement) => container.querySelector('.g-figure__blur');

describe('blurHashStyle', () => {
  afterEach(() => vi.restoreAllMocks());

  it('paints the decoded picture over the average colour', () => {
    const put = stubCanvas();
    const style = blurHashStyle(HASH);
    expect(style?.backgroundImage).toBe('url(data:image/png;base64,AAAA)');
    expect(style?.backgroundColor).toMatch(/^rgb\(2\d\d, 1\d\d, \d+\)$/);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('falls back to the average colour when there is no canvas context', () => {
    stubCanvas(null);
    const style = blurHashStyle(HASH);
    expect(style?.backgroundImage).toBeUndefined();
    expect(style?.backgroundColor).toMatch(/^rgb\(/);
  });

  it('falls back to the average colour when drawing throws', () => {
    stubCanvas({
      putImageData: () => {
        throw new Error('boom');
      },
    });
    expect(blurHashStyle(HASH)?.backgroundImage).toBeUndefined();
  });

  it('is null for a missing, empty or malformed hash and never throws', () => {
    expect(blurHashStyle(undefined)).toBeNull();
    expect(blurHashStyle('')).toBeNull();
    expect(blurHashStyle('not a hash!')).toBeNull();
  });
});

describe('ImageFigure placeholder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubCanvas();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const img = () => screen.getByRole('img', { name: 'A graph' });
  const draw = (blurHash?: string, extra: object = {}) =>
    render(
      <ImageFigure
        src={SRC}
        alt="A graph"
        width={1000}
        height={600}
        blurHash={blurHash}
        {...extra}
      />,
    );

  it('shows a hidden placeholder at the image aspect ratio while the image loads', async () => {
    const { container } = draw(HASH);
    const blur = blurOf(container) as HTMLElement;
    expect(blur.getAttribute('aria-hidden')).toBe('true');
    expect(blur.textContent).toBe('');
    expect(blur.style.backgroundImage).toContain('data:image/png');
    const frame = container.querySelector('.g-figure__media') as HTMLElement;
    expect(frame.style.aspectRatio).toBe('1000 / 600');
    expect(frame.style.width).toBe('min(100%, 1000px)');
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(img().getAttribute('alt')).toBe('A graph');
    vi.useRealTimers();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('fades out when the image has loaded, then removes the placeholder', () => {
    const { container } = draw(HASH);
    fireEvent.load(img());
    expect(blurOf(container)?.className).toContain('g-figure__blur--out');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(blurOf(container)).toBeNull();
    // The image itself was not remounted.
    expect(img().getAttribute('src')).toBe(SRC);
  });

  it('removes it at once under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { container } = draw(HASH);
    fireEvent.load(img());
    expect(blurOf(container)).toBeNull();
  });

  it('keeps the fade when the browser has no matchMedia or does not ask for less motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { container } = draw(HASH);
    fireEvent.load(img());
    expect(blurOf(container)).not.toBeNull();
    vi.stubGlobal('matchMedia', undefined);
    fireEvent.load(img());
    expect(blurOf(container)).not.toBeNull();
  });

  it('shows the placeholder again for a new address', () => {
    const { container, rerender } = draw(HASH);
    fireEvent.load(img());
    act(() => {
      vi.advanceTimersByTime(400);
    });
    rerender(
      <ImageFigure
        src="https://x.test/b.png"
        alt="A graph"
        width={10}
        height={6}
        blurHash={HASH}
      />,
    );
    expect(blurOf(container)).not.toBeNull();
  });

  it('renders nothing extra for a malformed hash, a missing hash or missing sizes', () => {
    for (const ui of [
      <ImageFigure key="a" src={SRC} alt="A graph" width={10} height={6} blurHash="nope" />,
      <ImageFigure key="b" src={SRC} alt="A graph" width={10} height={6} />,
      <ImageFigure key="c" src={SRC} alt="A graph" blurHash={HASH} />,
      <ImageFigure key="d" src={SRC} alt="A graph" width={10} blurHash={HASH} />,
    ]) {
      const { container, unmount } = render(ui);
      expect(container.querySelector('.g-figure__media')).toBeNull();
      expect(blurOf(container)).toBeNull();
      unmount();
    }
  });

  it('keeps the placeholder inside the zoom button and drops it with the failed image', () => {
    const { container } = draw(HASH, { zoom: true });
    expect(
      screen
        .getByRole('button', { name: 'Open full size: A graph' })
        .querySelector('.g-figure__blur'),
    ).not.toBeNull();
    fireEvent.error(img());
    expect(blurOf(container)).toBeNull();
    expect(container.querySelector('.g-figure__missing')?.textContent).toBe('A graph');
  });
});
