import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UserCard } from '../src/UserCard';
import { axeViolations } from './axe';

describe('UserCard', () => {
  const signOut = vi.fn();
  const card = (props: Partial<React.ComponentProps<typeof UserCard>> = {}) =>
    render(
      <UserCard
        name="Asha Rao"
        detail="asha.rao@example.com"
        items={[{ label: 'Sign out', onSelect: signOut, danger: true }]}
        {...props}
      />,
    );

  it('is one button naming the menu and the person, showing avatar, name and detail', async () => {
    const { container } = card();
    const trigger = screen.getByRole('button', { name: /^Account: Asha Rao/ });
    expect(trigger.className).toBe('g-user-card__trigger');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.textContent).toBe('ARAccount: Asha Rao asha.rao@example.com');
    expect(container.querySelector('.g-avatar--learner.g-avatar--36')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('opens its menu upwards from the start and runs the chosen item', async () => {
    const { container } = card({ tone: 'admin', menuLabel: 'Your account' });
    const trigger = screen.getByRole('button', {
      name: 'Your account: Asha Rao asha.rao@example.com',
    });
    expect(container.querySelector('.g-avatar--admin')).toBeTruthy();
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Your account: Asha Rao asha.rao@example.com' });
    expect(menu.className).toBe('g-menu__panel g-menu__panel--top g-menu__panel--start');
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledOnce();
  });
});

describe('UserCard photo', () => {
  it('passes the photo to the avatar', () => {
    const { container } = render(
      <UserCard
        name="Asha Rao"
        detail="asha@example.com"
        photoUrl="https://example.com/a.png"
        items={[{ label: 'Profile', onSelect: () => {} }]}
      />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png');
  });
});
