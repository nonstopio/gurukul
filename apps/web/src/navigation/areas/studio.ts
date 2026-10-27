import type { AreaNavigation } from '../types';

/** Vyasa Studio, where Acharyas build courses. Pages land with milestone M5. */
export const navigation = {
  slug: 'studio',
  name: 'Vyasa Studio',
  roles: ['acharya', 'kulapati'],
  keywords: ['author', 'educator', 'build'],
  pages: [
    {
      id: 'studio-courses',
      path: '/studio',
      label: 'Studio',
      description: 'Build and publish courses',
      keywords: ['courses', 'author', 'edit', 'create'],
    },
  ],
} satisfies AreaNavigation;
