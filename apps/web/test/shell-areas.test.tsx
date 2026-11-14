import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { areaKeyOf, roleLabel } from '../src/Shell';
import { terms } from '../src/labels/terms';
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
    expect(areaKeyOf('/team')).toBe('team');
    expect(areaKeyOf('/team/web')).toBe('team');
    expect(areaKeyOf('/teams')).toBe('learn');
  });

  it('names the highest role, a Manager below an Educator', () => {
    const t = terms('generic');
    expect(roleLabel(['learner'], t)).toBe('Learner');
    expect(roleLabel(['learner', 'manager'], t)).toBe('Manager');
    expect(roleLabel(['learner', 'manager', 'educator'], t)).toBe('Educator');
    expect(roleLabel(['learner', 'manager', 'admin'], t)).toBe('Admin');
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
    expect(links.map((l) => l.textContent)).toEqual(['Learn', 'Studio', 'Team', 'Admin']);
    expect(links.map((l) => l.getAttribute('aria-current'))).toEqual([null, null, null, 'page']);
    const main = screen.getByRole('navigation', { name: 'Main' });
    expect(within(main).getByRole('link', { name: 'Audit log' })).toBeTruthy();
    expect(within(main).getByRole('link', { name: 'Design system' })).toBeTruthy();
    expect(within(main).getByRole('link', { name: 'Mascot' })).toBeTruthy();
    expect(within(main).queryByRole('link', { name: 'Home' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Gurukul home' }).getAttribute('href')).toBe('/');
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

  it('takes an Admin home from the console through the logo', async () => {
    await openApp('/admin/learners', { roles: ['admin'] });
    fireEvent.click(await screen.findByRole('link', { name: 'Gurukul home' }));
    expect(await screen.findByRole('heading', { level: 1, name: /^Namaste/ })).toBeTruthy();
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

  it('switches Light, System and Dark from the top bar, shows the choice and remembers it', async () => {
    await openApp('/');
    const group = await screen.findByRole('group', { name: 'Theme' });
    const pressed = () =>
      within(group)
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.textContent);
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Light', 'System', 'Dark']);
    expect(pressed()).toEqual(['System']);
    fireEvent.click(within(group).getByRole('button', { name: 'Dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('gurukul-theme')).toBe('dark');
    expect(pressed()).toEqual(['Dark']);
    fireEvent.click(within(group).getByRole('button', { name: 'Light' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(pressed()).toEqual(['Light']);
    fireEvent.click(within(group).getByRole('button', { name: 'System' }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('gurukul-theme')).toBeNull();
    expect(pressed()).toEqual(['System']);
    localStorage.clear();
  });

  it("keeps the account menu to Profile, names, What's new and Sign out", async () => {
    await openApp('/');
    fireEvent.click(await screen.findByRole('button', { name: /^Account:/ }));
    expect(screen.queryByRole('menuitem', { name: /Theme/ })).toBeNull();
    expect(screen.getByRole('menuitem', { name: "What's new" })).toBeTruthy();
  });
});

describe('the foot of the page', () => {
  it('ends the sidebar layout', async () => {
    await openApp('/');
    const foot = await screen.findByRole('contentinfo');
    expect(within(foot).getByRole('link', { name: "What's new" })).toBeTruthy();
  });

  it('is left out of the focused layout (a lesson)', async () => {
    await openApp('/courses/git/learn/l1');
    expect((await screen.findByRole('main')).className).toBe('focused');
    expect(screen.queryByRole('contentinfo')).toBeNull();
  });
});
