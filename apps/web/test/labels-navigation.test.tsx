import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { terms } from '../src/labels/terms';
import { AREAS } from '../src/navigation';
import { localize, localizeLabel } from '../src/navigation/localize';
import { navIcon } from '../src/Shell';
import { fakeConsole, userRow } from './fake-console';
import { openApp } from './harness';

describe('localize', () => {
  it('swaps each known word by its case and leaves the rest alone', () => {
    const k = terms('gurukul');
    expect(localize('Learners and learner Quizzes in Studio; Analytics, adminship', k)).toBe(
      'Shishyas and Shishya Parikshas in Karyashala; Sanjaya, adminship',
    );
    const text = 'Reusable Quiz questions for learners';
    expect(localize(text, terms('generic'))).toBe(text);
  });
});

describe('localizeLabel', () => {
  it('names the pages that are a name by themselves, and falls back to localize', () => {
    const k = terms('gurukul');
    expect(
      ['Home', 'Catalogue', 'Certificates', 'Teams', 'My teams', 'Question bank', 'Learners'].map(
        (l) => localizeLabel(l, k),
      ),
    ).toEqual([
      'Ashram',
      'Granthalaya',
      'Pramanapatras',
      'Kulas',
      'My Kulas',
      'Prashna Kosha',
      'Shishyas',
    ]);
    expect(localizeLabel('Question bank', terms('generic'))).toBe('Question bank');
  });
});

const options = () =>
  within(screen.getByRole('dialog', { name: 'Search Gurukul' }))
    .getAllByRole('option')
    .map((o) => o.textContent);

describe('navigation in Gurukul names', () => {
  it('names the sidebar, the title and search results, and finds pages by the Gurukul name', async () => {
    const asha = userRow(7, { displayName: 'Asha Rao' });
    const c = fakeConsole({ users: [asha], found: [asha], count: 1 });
    await openApp('/admin/learners', { roles: ['admin'], labels: 'gurukul', console: c });
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(nav.textContent).toContain('Kulapati console');
    expect(screen.getByRole('navigation', { name: 'Areas' }).textContent).toContain('Karyashala');
    expect(screen.getByRole('link', { name: 'Shishyas' })).toBeTruthy();
    await waitFor(() => expect(document.title).toBe('Shishyas · Gurukul'));

    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    await act(async () => {});
    fireEvent.change(screen.getByRole('combobox', { name: 'Search Gurukul' }), {
      target: { value: 'pariksha' },
    });
    expect(options()[0]).toContain('Prashna KoshaKaryashala · Reusable Pariksha questions');
    fireEvent.change(screen.getByRole('combobox', { name: 'Search Gurukul' }), {
      target: { value: 'shishyas' },
    });
    expect(options()[0]).toContain('ShishyasKulapati console');
    fireEvent.change(screen.getByRole('combobox', { name: 'Search Gurukul' }), {
      target: { value: 'asha' },
    });
    expect((await screen.findByRole('option', { name: /Asha Rao/ })).textContent).toContain(
      'Shishyas',
    );
  });
});

describe('search in the Gurukul set', () => {
  it('finds Ashram by "home" and Granthalaya by "catalogue", the generic words', async () => {
    await openApp('/courses', { labels: 'gurukul' });
    fireEvent.click(await screen.findByRole('button', { name: /Search/ }));
    await act(async () => {});
    const box = screen.getByRole('combobox', { name: 'Search Gurukul' });
    fireEvent.change(box, { target: { value: 'home' } });
    expect(options().some((o) => o?.startsWith('Ashram'))).toBe(true);
    fireEvent.change(box, { target: { value: 'catalogue' } });
    expect(options().some((o) => o?.startsWith('Granthalaya'))).toBe(true);
  });
});

describe('sidebar icons', () => {
  it('gives every page in the navigation an icon, and none to an unknown id', () => {
    const ids = AREAS.flatMap((a) => a.pages.map((p) => p.id));
    expect(ids.filter((id) => navIcon(id) === undefined)).toEqual([]);
    expect(navIcon('no-such-page')).toBeUndefined();
  });
});
