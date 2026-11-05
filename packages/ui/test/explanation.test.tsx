import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Explanation, type ExplanationVerdict } from '../src';
import { axeViolations } from './axe';

describe('Explanation', () => {
  it.each<ExplanationVerdict>(['correct', 'incorrect', 'neutral'])(
    'is a live region with its %s verdict in words, the reason under it',
    async (verdict) => {
      const { container } = render(
        <Explanation verdict={verdict} title="Correct. Here is why">
          <p>Git keeps the full history.</p>
        </Explanation>,
      );
      const box = screen.getByRole('status');
      expect(box.className).toBe(`g-explanation g-explanation--${verdict}`);
      expect(box.textContent).toBe('Correct. Here is whyGit keeps the full history.');
      expect(box.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(await axeViolations(container)).toEqual([]);
    },
  );

  it('is neutral by default and takes a role, classes and props', () => {
    render(<Explanation title="Why" role="note" className="x" data-testid="e" />);
    const box = screen.getByRole('note');
    expect(box.className).toBe('g-explanation g-explanation--neutral x');
    expect(box.textContent).toBe('Why');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
