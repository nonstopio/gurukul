import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  MASCOT_EXPRESSIONS,
  MASCOT_STATES,
  Mascot,
  type MascotExpression,
  type MascotState,
  type MascotVariant,
  mascotExpressionForState,
} from '../src';
import { axeViolations } from './axe';

const svgOf = (container: HTMLElement) => container.querySelector('svg') as SVGSVGElement;

describe('Mascot', () => {
  it('has the 24 Eklavya faces, in order, each with words', () => {
    expect(Object.keys(MASCOT_EXPRESSIONS)).toEqual([
      'neutral',
      'happy',
      'excited',
      'celebrate',
      'curious',
      'thinking',
      'focused',
      'wink',
      'surprised',
      'confused',
      'worried',
      'sad',
      'sleepy',
      'proud',
      'determined',
      'idea',
      'laugh',
      'love',
      'shy',
      'relieved',
      'starstruck',
      'cool',
      'hopeful',
      'nervous',
    ]);
  });

  it.each(Object.keys(MASCOT_EXPRESSIONS) as MascotExpression[])(
    'draws %s as a body and a face',
    (expression) => {
      const { container, unmount } = render(<Mascot expression={expression} />);
      expect(svgOf(container).dataset.expression).toBe(expression);
      expect(container.querySelector('.g-mascot__face')?.childElementCount).toBeGreaterThan(0);
      unmount();
      const face = render(<Mascot expression={expression} variant="face" size={32} />);
      expect(svgOf(face.container).getAttribute('viewBox')).toBe('36 12 128 128');
    },
  );

  it('maps every state to its face, and an unknown state to neutral', () => {
    expect(mascotExpressionForState('tip')).toBe('wink');
    expect(mascotExpressionForState('error')).toBe('sad');
    expect(mascotExpressionForState('empty')).toBe('curious');
    expect(mascotExpressionForState('loading')).toBe('cool');
    expect(mascotExpressionForState('toString')).toBe('neutral');
    expect(mascotExpressionForState(undefined)).toBe('neutral');
    for (const [state, face] of Object.entries(MASCOT_STATES)) {
      const { container, unmount } = render(<Mascot state={state as MascotState} />);
      expect(svgOf(container).dataset.expression).toBe(face);
      unmount();
    }
  });

  it('lets a state win over an expression, even an unknown state', () => {
    const { container, rerender } = render(<Mascot state="success" expression="sad" />);
    expect(svgOf(container).dataset.expression).toBe('happy');
    rerender(<Mascot state={'happy' as MascotState} expression="sad" />);
    expect(svgOf(container).dataset.expression).toBe('neutral');
  });

  it('falls back to neutral, body and 64px for values it does not know', () => {
    const { container, rerender } = render(
      <Mascot
        expression={'__proto__' as MascotExpression}
        variant={'draw' as MascotVariant}
        size={Infinity}
      />,
    );
    const svg = svgOf(container);
    expect(svg.dataset.expression).toBe('neutral');
    expect(svg.dataset.variant).toBe('body');
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 200');
    expect(svg.getAttribute('width')).toBe('64');
    rerender(<Mascot />);
    expect(svg.dataset.expression).toBe('neutral');
    expect(svg.getAttribute('height')).toBe('64');
    rerender(<Mascot size={-5} />);
    expect(svg.getAttribute('width')).toBe('64');
  });

  it('clamps a size to 16–512', () => {
    const { container, rerender } = render(<Mascot size={4} />);
    expect(svgOf(container).getAttribute('width')).toBe('16');
    rerender(<Mascot size={9000} />);
    expect(svgOf(container).getAttribute('width')).toBe('512');
    rerender(<Mascot size={88} />);
    expect(svgOf(container).getAttribute('width')).toBe('88');
  });

  it('is decorative without a label and a named image with one', async () => {
    const { container, rerender } = render(<Mascot state="empty" />);
    expect(svgOf(container).getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('img')).toBeNull();
    rerender(<Mascot state="empty" label="The owl, curious" className="x" />);
    const img = screen.getByRole('img', { name: 'The owl, curious' });
    expect(img.getAttribute('class')).toBe('g-mascot x');
    expect(img.hasAttribute('aria-hidden')).toBe(false);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('loops in the loading variant inside a status region, with the words beside it', async () => {
    const { container } = render(
      <div role="status">
        <Mascot state="loading" variant="loading" size={56} />
        <span>Loading your courses</span>
      </div>,
    );
    const svg = svgOf(container);
    expect(svg.getAttribute('class')).toBe('g-mascot g-mascot--loading');
    expect(svg.dataset.expression).toBe('cool');
    expect(container.querySelectorAll('.g-mascot__wing')).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toBe('Loading your courses');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('draws on a fixed light or dark ground and holds the loop when paused', () => {
    const { container, rerender } = render(<Mascot ground="light" />);
    expect(svgOf(container).getAttribute('class')).toBe('g-mascot g-mascot--ground-light');
    rerender(<Mascot ground="dark" variant="loading" paused />);
    expect(svgOf(container).getAttribute('class')).toBe(
      'g-mascot g-mascot--loading g-mascot--ground-dark g-mascot--paused',
    );
    rerender(<Mascot ground={'grey' as 'light'} paused={false} />);
    expect(svgOf(container).getAttribute('class')).toBe('g-mascot');
  });

  it('adds brows, sparkles, a bulb, blush and a sweat drop only where they belong', () => {
    const count = (expression: MascotExpression, selector: string) => {
      const { container, unmount } = render(<Mascot expression={expression} />);
      const n = container.querySelectorAll(selector).length;
      unmount();
      return n;
    };
    expect(count('celebrate', '.g-mascot__sparkle')).toBe(1);
    expect(count('proud', '.g-mascot__sparkle')).toBe(1);
    expect(count('neutral', '.g-mascot__sparkle')).toBe(0);
    expect(count('idea', '.g-mascot__bulb')).toBe(1);
    expect(count('laugh', '.g-mascot__blush')).toBe(1);
    expect(count('relieved', '.g-mascot__sweat')).toBe(1);
    expect(count('nervous', '.g-mascot__sweat')).toBe(1);
    expect(count('happy', '.g-mascot__sweat')).toBe(0);
    expect(count('focused', '.g-mascot__face > path')).toBe(2);
    expect(count('neutral', '.g-mascot__face > path')).toBe(1);
  });
});

describe('mascot.css reduced motion', () => {
  it('keeps the loading owl pulsing in opacity, with no transform, under reduced motion', () => {
    // Vitest empties CSS imports, `?raw` included, so read the file itself.
    const css = readFileSync(resolve(import.meta.dirname, '../src/mascot.css'), 'utf8');
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('.g-mascot.g-mascot--loading .g-mascot__owl');
    expect(reduced).toMatch(/animation: g-mascot-pulse var\(--dur-loader\)/);
    expect(reduced).toMatch(/@keyframes g-mascot-pulse \{\s*50% \{\s*opacity: 0\.45;\s*\}\s*\}/);
    expect(reduced).not.toMatch(/transform/);
    expect(reduced).toContain('.g-mascot.g-mascot--loading.g-mascot--paused .g-mascot__owl');
  });
});
