import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SignInArt } from '../src/auth/SignInArt';
import { axeViolations } from './axe';

describe('SignInArt', () => {
  it('is decoration: hidden from assistive tech, with the board written out', async () => {
    const { container } = render(<SignInArt />);
    const art = container.firstElementChild as HTMLElement;
    expect(art.getAttribute('aria-hidden')).toBe('true');
    // The board text is real text, so it scales with the drawing and stays sharp.
    expect(art.textContent).toContain('Learning at Gurukul');
    for (const line of [
      'Teammates teach teammates',
      'Short lessons, plain words',
      'Quick quizzes as you go',
      'A certificate at the end',
    ]) {
      expect(art.textContent).toContain(line);
    }
    expect(await axeViolations(container)).toEqual([]);
  });
});
