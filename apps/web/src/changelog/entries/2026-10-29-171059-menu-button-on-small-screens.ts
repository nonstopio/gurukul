import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'MENU-BUTTON',
  title: 'The sidebar becomes a menu button on small screens',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'On a phone the sidebar took the whole first screen before you saw any content, so the page ' +
    'you came for started below the fold.',
  detail: [
    'Below 560px wide, a Menu button opens and closes the navigation, and it closes after you pick a page.',
    'Between 560px and 808px the navigation stacks above the page as a row you can scroll sideways.',
  ],
} satisfies ChangelogEntry;
