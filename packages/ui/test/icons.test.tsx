import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as ui from '../src';
import { Icon, LockIcon } from '../src';
import { axeViolations } from './axe';

const named = Object.entries(ui).filter(([name]) => /^[A-Z]\w*Icon$/.test(name)) as [
  string,
  typeof LockIcon,
][];

describe('Icon', () => {
  it('is a 16px decorative stroke icon by default', () => {
    const { container } = render(
      <Icon>
        <path d="M0 0" />
      </Icon>,
    );
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('1.5');
  });

  it('becomes a named image with a label and takes size and SVG attributes', async () => {
    const { container } = render(
      <p>
        <LockIcon label="Locked" size={20} strokeWidth={2} className="x" />
      </p>,
    );
    const svg = screen.getByRole('img', { name: 'Locked' });
    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(svg.getAttribute('height')).toBe('20');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    expect(svg.getAttribute('class')).toBe('x');
    expect(await axeViolations(container)).toEqual([]);
  });

  it.each(named)('%s draws a glyph and stays hidden from screen readers', async (name, Glyph) => {
    expect(Glyph.displayName).toBe(name);
    const { container } = render(
      <button type="button">
        <Glyph />
        Go
      </button>,
    );
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.childElementCount).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('exports every named icon', () => {
    expect(named).toHaveLength(42);
  });
});
