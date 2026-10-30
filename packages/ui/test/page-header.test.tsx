import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from '../src/PageHeader';
import { axeViolations } from './axe';

describe('PageHeader', () => {
  it('renders only the title as the h1 when that is all it has', async () => {
    const { container } = render(
      <main>
        <PageHeader title="Learners" />
      </main>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Learners');
    expect(container.querySelector('.g-page-header')?.className).toBe('g-page-header');
    for (const part of ['eyebrow', 'lead', 'meta', 'actions']) {
      expect(container.querySelector(`.g-page-header__${part}`)).toBeNull();
    }
    expect(await axeViolations(container)).toEqual([]);
  });

  it('renders breadcrumb first, then eyebrow, title, meta, lead and actions', async () => {
    const { container } = render(
      <main>
        <PageHeader
          className="x"
          breadcrumb={<nav aria-label="Breadcrumb">Console</nav>}
          eyebrow="Admin"
          title="Learners"
          meta={<span>12 people</span>}
          lead="Everyone who can sign in."
          actions={<button type="button">Invite</button>}
        />
      </main>,
    );
    const header = container.querySelector('.g-page-header') as HTMLElement;
    expect(header.className).toBe('g-page-header x');
    expect(header.firstElementChild?.getAttribute('aria-label')).toBe('Breadcrumb');
    const text = Array.from(container.querySelectorAll('.g-page-header__text > *')).map(
      (el) => el.className,
    );
    expect(text).toEqual([
      'g-page-header__eyebrow',
      'g-page-header__title',
      'g-page-header__meta',
      'g-page-header__lead',
    ]);
    expect(screen.getByText('Admin').tagName).toBe('P');
    expect(screen.getByRole('button', { name: 'Invite' }).parentElement?.className).toBe(
      'g-page-header__actions',
    );
    expect(await axeViolations(container)).toEqual([]);
  });

  it('renders its title as an h2 when shown inside another page', () => {
    render(<PageHeader title="Example page" titleAs="h2" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Example page' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
});
