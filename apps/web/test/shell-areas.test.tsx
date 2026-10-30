import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { areaKeyOf } from '../src/Shell';
import { axeViolations } from './axe';
import { openApp } from './harness';

describe('areaKeyOf', () => {
  it('reads the area from the first segment', () => {
    expect(areaKeyOf('/')).toBe('learn');
    expect(areaKeyOf('/courses/x')).toBe('learn');
    expect(areaKeyOf('/admin')).toBe('admin');
    expect(areaKeyOf('/admin/learners')).toBe('admin');
    expect(areaKeyOf('/administrators')).toBe('learn');
    expect(areaKeyOf('/studio')).toBe('studio');
    expect(areaKeyOf('/studio/bank')).toBe('studio');
  });
});

describe('the area switcher', () => {
  it('is absent for someone who can open only Learn, and the sidebar lists everything', async () => {
    await openApp('/');
    expect(screen.queryByRole('navigation', { name: 'Areas' })).toBeNull();
    expect(
      within(await screen.findByRole('navigation', { name: 'Main' })).getByText('Home'),
    ).toBeTruthy();
  });

  it('lists the areas an Admin may open, follows the route and shows only that area', async () => {
    const { container } = await openApp('/admin/learners', { roles: ['admin'] });
    const areas = await screen.findByRole('navigation', { name: 'Areas' });
    const links = within(areas).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Learn', 'Studio', 'Admin']);
    expect(links.map((l) => l.getAttribute('aria-current'))).toEqual([null, null, 'page']);
    const main = screen.getByRole('navigation', { name: 'Main' });
    expect(within(main).getByRole('link', { name: 'Audit log' })).toBeTruthy();
    expect(within(main).getByRole('link', { name: 'Design system' })).toBeTruthy();
    expect(within(main).queryByRole('link', { name: 'Home' })).toBeNull();
    expect(await axeViolations(container)).toEqual([]);

    fireEvent.click(within(areas).getByRole('link', { name: 'Studio' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Courses' })).toBeTruthy();
    expect(
      within(screen.getByRole('navigation', { name: 'Areas' }))
        .getByRole('link', { name: 'Studio' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
        name: 'Question bank',
      }),
    ).toBeTruthy();
  });

  it('shows an Educator only Learn and Studio', async () => {
    await openApp('/', { roles: ['educator'] });
    const areas = await screen.findByRole('navigation', { name: 'Areas' });
    expect(
      within(areas)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Learn', 'Studio']);
  });
});

describe('the account menu', () => {
  it('names the person, their email and their role', async () => {
    await openApp('/', { roles: ['admin'], labels: 'gurukul' });
    fireEvent.click(await screen.findByRole('button', { name: /^Account:/ }));
    const menu = screen.getByRole('menu');
    expect(menu.textContent).toContain('Kulapati');
    expect(menu.textContent).toContain('@');
    expect(within(menu).getByRole('menuitem', { name: 'Profile' })).toBeTruthy();
  });

  it('steps the theme from its Theme item', async () => {
    await openApp('/');
    fireEvent.click(await screen.findByRole('button', { name: /^Account:/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Theme/ }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    fireEvent.click(await screen.findByRole('button', { name: /^Account:/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Theme/ }));
    // Dark: the menu item shows the moon.
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    fireEvent.click(await screen.findByRole('button', { name: /^Account:/ }));
    expect(screen.getByRole('menuitem', { name: /Theme/ }).textContent).toContain('Dark');
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });
});
