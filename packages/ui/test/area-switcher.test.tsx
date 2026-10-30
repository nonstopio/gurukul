import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AreaSwitcher, Menu, Sidebar, UserCard } from '../src';
import { axeViolations } from './axe';

const items = [
  { id: 'learn', label: 'Learn', href: '/' },
  { id: 'studio', label: 'Studio', href: '/studio', current: true },
  { id: 'admin', label: 'Admin', href: '/admin' },
];

describe('AreaSwitcher', () => {
  it('is a named nav of links, the current area marked', async () => {
    const { container } = render(<AreaSwitcher items={items} />);
    const nav = screen.getByRole('navigation', { name: 'Areas' });
    const links = Array.from(nav.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/studio', '/admin']);
    expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page', null]);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('takes its own name and lets a router draw each link', () => {
    const go = vi.fn();
    render(
      <AreaSwitcher
        label="Switch area"
        items={items.map((i) => ({
          ...i,
          render: (p) => (
            <button type="button" {...(p as object)} onClick={() => go(i.id)}>
              {p.children}
            </button>
          ),
        }))}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Admin' }));
    expect(go).toHaveBeenCalledWith('admin');
    expect(screen.getByRole('navigation', { name: 'Switch area' })).toBeTruthy();
  });

  it('sits under the brand in a Sidebar, and only when given', () => {
    const { rerender } = render(
      <Sidebar label="Main" brand="B" switcher={<AreaSwitcher items={items} />}>
        <span>nav</span>
      </Sidebar>,
    );
    expect(screen.getByRole('navigation', { name: 'Areas' })).toBeTruthy();
    rerender(
      <Sidebar label="Main" brand="B">
        <span>nav</span>
      </Sidebar>,
    );
    expect(screen.queryByRole('navigation', { name: 'Areas' })).toBeNull();
  });
});

describe('Menu header and UserCard role', () => {
  it('shows a static header above the items, outside the arrow-key order', async () => {
    const { container } = render(
      <Menu label="Actions" header={<b>Who</b>} items={[{ label: 'One', onSelect: vi.fn() }]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByText('Who').parentElement?.className).toBe('g-menu__header');
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows name, email and role chip in the account menu', async () => {
    const { container } = render(
      <UserCard
        name="Asha Rao"
        detail="asha@example.com"
        tone="admin"
        roleLabel="Kulapati"
        items={[{ label: 'Sign out', onSelect: vi.fn() }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Account: Asha Rao/ }));
    const menu = screen.getByRole('menu');
    expect(menu.textContent).toContain('Asha Rao');
    expect(menu.textContent).toContain('asha@example.com');
    expect(menu.textContent).toContain('Kulapati');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows a neutral chip for a learner and for no tone', () => {
    const { rerender } = render(
      <UserCard name="A" detail="a@x.org" tone="learner" roleLabel="Learner" items={[]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Account/ }));
    expect(document.querySelector('.g-chip--neutral')).toBeTruthy();
    rerender(<UserCard name="A" detail="a@x.org" roleLabel="Learner" items={[]} />);
    expect(document.querySelector('.g-chip--neutral')).toBeTruthy();
  });
});
