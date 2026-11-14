import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Explanation, type ExplanationVerdict } from '../src';
import { axeViolations } from './axe';

describe('Explanation', () => {
  it.each<[ExplanationVerdict, string]>([
    ['correct', 'happy'],
    ['incorrect', 'wink'],
    ['neutral', 'neutral'],
  ])(
    'is a live region with its %s verdict in words, the reason under it, led by the owl (%s)',
    async (verdict, face) => {
      const { container } = render(
        <Explanation verdict={verdict} title="Correct. Here is why">
          <p>Git keeps the full history.</p>
        </Explanation>,
      );
      const box = screen.getByRole('status');
      expect(box.className).toBe(`g-explanation g-explanation--${verdict}`);
      expect(box.textContent).toBe('Correct. Here is whyGit keeps the full history.');
      const owl = box.querySelector('svg.g-mascot');
      expect(owl?.getAttribute('aria-hidden')).toBe('true');
      expect(owl?.getAttribute('data-expression')).toBe(face);
      expect(owl?.getAttribute('data-variant')).toBe('face');
      expect(await axeViolations(container)).toEqual([]);
    },
  );

  it('never meets a wrong answer with a sad or worried owl', () => {
    render(<Explanation verdict="incorrect" title="Not quite" />);
    const face = screen
      .getByRole('status')
      .querySelector('.g-mascot')
      ?.getAttribute('data-expression');
    expect(['sad', 'worried']).not.toContain(face);
  });

  it('is neutral by default and takes a role, classes and props', () => {
    render(<Explanation title="Why" role="note" className="x" data-testid="e" />);
    const box = screen.getByRole('note');
    expect(box.className).toBe('g-explanation g-explanation--neutral x');
    expect(box.textContent).toBe('Why');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
