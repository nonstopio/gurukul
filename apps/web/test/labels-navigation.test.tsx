import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { terms } from '../src/labels/terms';
import { AREAS } from '../src/navigation';
import { localize } from '../src/navigation/localize';
import { navIcon } from '../src/Shell';
import { fakeConsole, userRow } from './fake-console';
import { openApp } from './harness';

describe('localize', () => {
  it('swaps each known word by its case and leaves the rest alone', () => {
    const k = terms('gurukul');
    expect(localize('Learners and learner Quizzes in Studio; Analytics, adminship', k)).toBe(
      'Shishyas and Shishya Parikshas in Vyasa Studio; Sanjaya, adminship',
    );
    const text = 'Reusable Quiz questions for learners';
    expect(localize(text, terms('generic'))).toBe(text);
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
    expect(screen.getByRole('navigation', { name: 'Areas' }).textContent).toContain('Vyasa Studio');
    expect(screen.getByRole('link', { name: 'Shishyas' })).toBeTruthy();
    await waitFor(() => expect(document.title).toBe('Shishyas · Gurukul'));

    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    await act(async () => {});
    fireEvent.change(screen.getByRole('combobox', { name: 'Search Gurukul' }), {
      target: { value: 'pariksha' },
    });
    expect(options()[0]).toContain('Question bankVyasa Studio · Reusable Pariksha questions');
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

describe('sidebar icons', () => {
  it('gives every page in the navigation an icon, and none to an unknown id', () => {
    const ids = AREAS.flatMap((a) => a.pages.map((p) => p.id));
    expect(ids.filter((id) => navIcon(id) === undefined)).toEqual([]);
    expect(navIcon('no-such-page')).toBeUndefined();
  });
});
