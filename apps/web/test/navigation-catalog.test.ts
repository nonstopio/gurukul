import { describe, expect, it } from 'vitest';
import { collectAreas, destinationsFor } from '../src/navigation/catalog';
import type { AreaNavigation } from '../src/navigation/types';

const learn: AreaNavigation = {
  slug: 'learn',
  name: 'Learning',
  keywords: ['learner'],
  pages: [
    { id: 'home', path: '/', label: 'Home', description: 'Start', keywords: ['start'] },
    { id: 'drafts', path: '/drafts', label: 'Drafts', roles: ['educator'] },
  ],
};
const console_: AreaNavigation = {
  slug: 'admin',
  name: 'Admin console',
  roles: ['admin'],
  pages: [{ id: 'learners', path: '/admin/learners', label: 'Learners' }],
};

describe('collectAreas', () => {
  it('orders areas by file name', () => {
    expect(
      collectAreas({
        './areas/b.ts': { navigation: console_ },
        './areas/a.ts': { navigation: learn },
      }).map((a) => a.slug),
    ).toEqual(['learn', 'admin']);
  });
});

describe('destinationsFor', () => {
  it('shows a learner only what everyone may open', () => {
    expect(destinationsFor([learn, console_], ['learner'])).toEqual([
      {
        id: 'home',
        path: '/',
        label: 'Home',
        areaName: 'Learning',
        description: 'Start',
        keywords: ['learner', 'start'],
      },
    ]);
  });

  it('adds pages and areas a role unlocks', () => {
    expect(destinationsFor([learn, console_], ['learner', 'educator']).map((d) => d.id)).toEqual([
      'home',
      'drafts',
    ]);
    const admin = destinationsFor([learn, console_], ['learner', 'admin']);
    expect(admin.map((d) => d.id)).toEqual(['home', 'learners']);
    expect(admin[1]).toMatchObject({ description: '', keywords: [] });
  });
});
