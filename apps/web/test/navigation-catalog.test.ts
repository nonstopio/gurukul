import { describe, expect, it } from 'vitest';
import { collectAreas, destinationsFor } from '../src/navigation/catalog';
import type { AreaNavigation } from '../src/navigation/types';

const learn: AreaNavigation = {
  slug: 'learn',
  name: 'Learning',
  keywords: ['shishya'],
  pages: [
    { id: 'home', path: '/', label: 'Home', description: 'Start', keywords: ['start'] },
    { id: 'drafts', path: '/drafts', label: 'Drafts', roles: ['acharya'] },
  ],
};
const console_: AreaNavigation = {
  slug: 'kulapati',
  name: 'Kulapati console',
  roles: ['kulapati'],
  pages: [{ id: 'learners', path: '/kulapati/learners', label: 'Learners' }],
};

describe('collectAreas', () => {
  it('orders areas by file name', () => {
    expect(
      collectAreas({
        './areas/b.ts': { navigation: console_ },
        './areas/a.ts': { navigation: learn },
      }).map((a) => a.slug),
    ).toEqual(['learn', 'kulapati']);
  });
});

describe('destinationsFor', () => {
  it('shows a shishya only what everyone may open', () => {
    expect(destinationsFor([learn, console_], ['shishya'])).toEqual([
      {
        id: 'home',
        path: '/',
        label: 'Home',
        areaName: 'Learning',
        description: 'Start',
        keywords: ['shishya', 'start'],
      },
    ]);
  });

  it('adds pages and areas a role unlocks', () => {
    expect(destinationsFor([learn, console_], ['shishya', 'acharya']).map((d) => d.id)).toEqual([
      'home',
      'drafts',
    ]);
    const kulapati = destinationsFor([learn, console_], ['shishya', 'kulapati']);
    expect(kulapati.map((d) => d.id)).toEqual(['home', 'learners']);
    expect(kulapati[1]).toMatchObject({ description: '', keywords: [] });
  });
});
