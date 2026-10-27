import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NavItem, Sidebar, SidebarGroup, TopBar, topBarBackClass } from '../src';
import { axeViolations } from './axe';

describe('NavItem', () => {
  it('is a plain link without aria-current by default', () => {
    render(<NavItem href="/courses">Courses</NavItem>);
    const link = screen.getByRole('link', { name: 'Courses' });
    expect(link.getAttribute('href')).toBe('/courses');
    expect(link.hasAttribute('aria-current')).toBe(false);
    expect(link.className).toBe('g-nav-item');
  });

  it('marks the current page and hides its icon from assistive tech', () => {
    render(
      <NavItem href="/" current icon={<svg data-testid="i" />} className="x">
        Home
      </NavItem>,
    );
    const link = screen.getByRole('link', { name: 'Home' });
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.className).toBe('g-nav-item g-nav-item--current x');
    expect(screen.getByTestId('i').parentElement?.getAttribute('aria-hidden')).toBe('true');
  });

  it('lets a router draw the anchor through render, keeping its props', () => {
    const onNavigate = vi.fn();
    render(
      <NavItem
        current
        onClick={onNavigate}
        render={(props) => (
          <button type="button" data-router="yes" {...(props as object)}>
            {props.children}
          </button>
        )}
      >
        Learn
      </NavItem>,
    );
    const el = screen.getByRole('button', { name: 'Learn' });
    expect(el.getAttribute('data-router')).toBe('yes');
    expect(el.getAttribute('aria-current')).toBe('page');
    expect(el.className).toContain('g-nav-item--current');
    fireEvent.click(el);
    expect(onNavigate).toHaveBeenCalledOnce();
  });
});

describe('Sidebar', () => {
  it('renders brand, a named navigation landmark and groups', () => {
    render(
      <Sidebar brand="Gurukul" label="Main" className="x">
        <SidebarGroup label="Learn">
          <NavItem href="/a" current>
            Dashboard
          </NavItem>
        </SidebarGroup>
        <SidebarGroup label="Admin">
          <NavItem href="/b">Users</NavItem>
        </SidebarGroup>
      </Sidebar>,
    );
    expect(screen.getByText('Gurukul')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Learn' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Admin' })).toBeTruthy();
    expect(screen.getByRole('complementary').className).toBe('g-sidebar x');
  });

  it('pins an optional footer and omits it otherwise', () => {
    const { container, rerender } = render(
      <Sidebar brand="G" label="Main">
        <NavItem href="/">Home</NavItem>
      </Sidebar>,
    );
    expect(container.querySelector('.g-sidebar__footer')).toBeNull();
    rerender(
      <Sidebar brand="G" label="Main" footer={<span>Asha Rao</span>}>
        <NavItem href="/">Home</NavItem>
      </Sidebar>,
    );
    expect(container.querySelector('.g-sidebar__footer')?.textContent).toBe('Asha Rao');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <Sidebar brand="Gurukul" label="Main" footer={<span>Asha</span>}>
        <SidebarGroup label="Learn">
          <NavItem href="/a" current icon={<svg />}>
            Dashboard
          </NavItem>
          <NavItem href="/b">Courses</NavItem>
        </SidebarGroup>
      </Sidebar>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('TopBar', () => {
  it('renders only the title when nothing else is given', () => {
    const { container } = render(<TopBar title="Git basics" className="x" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Git basics' })).toBeTruthy();
    expect(screen.getByRole('banner').className).toBe('g-topbar x');
    expect(container.querySelector('.g-topbar__status')).toBeNull();
    expect(container.querySelector('.g-topbar__actions')).toBeNull();
  });

  it('renders back, status and actions', () => {
    render(
      <TopBar
        title="Git basics"
        back={
          <a className={topBarBackClass} href="/courses">
            Back to course
          </a>
        }
        status={<span>Saved</span>}
        actions={<button type="button">Finish</button>}
      />,
    );
    expect(screen.getByRole('link', { name: 'Back to course' }).className).toBe('g-topbar__back');
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeTruthy();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <TopBar
        title="Git basics"
        back={<a href="/">Back</a>}
        status="Saved"
        actions={<button type="button">Next</button>}
      />,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
