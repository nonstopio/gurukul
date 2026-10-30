import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, initials } from '../src/Avatar';
import { axeViolations } from './axe';

describe('Avatar', () => {
  it.each([
    ['Asha Rao', 'AR'],
    ['  asha  devi  rao ', 'AR'],
    ['Asha', 'A'],
    ['asha.rao@example.com', 'A'],
    ['', '?'],
    ['   ', '?'],
  ])('initials of %j are %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it('is hidden from assistive tech by default, learner and 36px', () => {
    const { container } = render(<Avatar name="Asha Rao" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.textContent).toBe('AR');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.className).toBe('g-avatar g-avatar--learner g-avatar--36');
  });

  it('with a label is a named image; tone, size and className apply', async () => {
    const { container } = render(
      <Avatar name="Ravi Kumar" tone="admin" size={48} label="Ravi Kumar" className="x" />,
    );
    const img = screen.getByRole('img', { name: 'Ravi Kumar' });
    expect(img.className).toBe('g-avatar g-avatar--admin g-avatar--48 x');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('educator tone and small size', () => {
    const { container } = render(<Avatar name="Meera" tone="educator" size={24} />);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      'g-avatar--educator g-avatar--24',
    );
  });
});
