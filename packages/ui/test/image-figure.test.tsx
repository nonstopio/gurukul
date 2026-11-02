import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageFigure } from '../src';
import { axeViolations } from './axe';

const SRC = 'https://x.test/a.png';
const img = () => screen.getByRole('img', { name: 'A graph' }) as HTMLImageElement;
const loaded = (el: HTMLImageElement, naturalWidth: number, naturalHeight: number) => {
  Object.defineProperty(el, 'naturalWidth', { value: naturalWidth, configurable: true });
  Object.defineProperty(el, 'naturalHeight', { value: naturalHeight, configurable: true });
  fireEvent.load(el);
};

describe('ImageFigure', () => {
  it('reads missing fields as a framed column image that does not open', async () => {
    const { container } = render(<ImageFigure src={SRC} alt="A graph" />);
    const figure = container.querySelector('figure') as HTMLElement;
    expect(figure.className).toContain('g-figure--column');
    expect(figure.className).not.toContain('g-figure--bare');
    expect(screen.queryByRole('button')).toBeNull();
    expect(img().getAttribute('loading')).toBe('lazy');
    expect(img().getAttribute('decoding')).toBe('async');
    expect(img().hasAttribute('width')).toBe(false);
    expect(container.querySelector('figcaption')).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it.each(['column', 'medium', 'small'] as const)('lays out %s', (layout) => {
    const { container } = render(<ImageFigure src={SRC} alt="A graph" layout={layout} />);
    expect(container.querySelector('figure')?.className).toContain(`g-figure--${layout}`);
  });

  it('removes the frame when border is false', () => {
    const { container } = render(<ImageFigure src={SRC} alt="A graph" border={false} />);
    expect(container.querySelector('figure')?.className).toContain('g-figure--bare');
  });

  it('sets width and height when known', () => {
    render(<ImageFigure src={SRC} alt="A graph" width={1600} height={900} />);
    expect(img().getAttribute('width')).toBe('1600');
    expect(img().getAttribute('height')).toBe('900');
  });

  it('shows the alt text in a quiet box when the image fails, and no zoom button', () => {
    const { container } = render(<ImageFigure src={SRC} alt="A graph" zoom caption="Figure 1" />);
    fireEvent.error(img());
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('.g-figure__missing')?.textContent).toBe('A graph');
    expect(screen.getByText('Figure 1')).toBeTruthy();
  });

  it('tries a new address after a failure', () => {
    const { rerender } = render(<ImageFigure src={SRC} alt="A graph" />);
    fireEvent.error(img());
    rerender(<ImageFigure src="https://x.test/b.png" alt="A graph" />);
    expect(img().getAttribute('src')).toBe('https://x.test/b.png');
  });

  it('opens full size in a dialog with the caption, and closes on Escape', async () => {
    render(<ImageFigure src={SRC} alt="A graph" zoom caption="Figure 1" />);
    const open = screen.getByRole('button', { name: 'Open full size: A graph' });
    open.focus();
    fireEvent.click(open);
    const dialog = screen.getByRole('dialog', { name: 'A graph' });
    expect(dialog.querySelectorAll('img')).toHaveLength(1);
    expect(dialog.textContent).toContain('Figure 1');
    expect(screen.getByRole('region', { name: 'Full size image' }).tabIndex).toBe(0);
    expect(await axeViolations(dialog)).toEqual([]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(open);
  });

  it('opens full size without a caption', () => {
    render(<ImageFigure src={SRC} alt="A graph" zoom />);
    fireEvent.click(screen.getByRole('button', { name: /Open full size/ }));
    expect(screen.getByRole('dialog').querySelector('.g-figure__caption')).toBeNull();
  });

  it('reports the natural size once loaded, and ignores an image with none', () => {
    const onSize = vi.fn();
    render(<ImageFigure src={SRC} alt="A graph" onSize={onSize} />);
    loaded(img(), 0, 0);
    expect(onSize).not.toHaveBeenCalled();
    loaded(img(), 1600, 900);
    expect(onSize).toHaveBeenCalledWith({ width: 1600, height: 900 });
  });

  it('loads without an onSize listener', () => {
    render(<ImageFigure src={SRC} alt="A graph" />);
    loaded(img(), 10, 10);
    expect(img()).toBeTruthy();
  });
});
