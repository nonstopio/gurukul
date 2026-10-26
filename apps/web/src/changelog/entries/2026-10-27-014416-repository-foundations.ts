import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-27',
  id: 'GURUKUL-FOUNDATIONS',
  title: 'Gurukul has a repository, a design system and a placeholder page',
  area: 'PLATFORM',
  kind: 'chore',
  why:
    'Quality is cheapest on day one: every rule that is in place before the first feature never has ' +
    'to be retrofitted onto a hundred files that grew up without it.',
  detail: [
    'Every workspace must keep 100% test coverage; CI refuses anything less.',
    'Colours, type and spacing come from one tokens file, so every screen looks like the same product.',
    'The site shows a short "being built" page with a link to the repository until the first screens land.',
  ],
} satisfies ChangelogEntry;
