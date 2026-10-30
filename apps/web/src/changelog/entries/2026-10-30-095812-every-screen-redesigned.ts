import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'RDS-REDESIGN',
  title: 'Every screen redesigned: the menu stays put, and you have a profile',
  area: 'DESIGN',
  kind: 'feature',
  why:
    'On a long page the sidebar scrolled away and Sign out ended up at the very bottom, ' +
    'dropdowns looked different on every computer, and each screen had its own idea of a ' +
    'header. Every screen is now built from the same parts, so it reads and behaves the same ' +
    'wherever you are.',
  detail: [
    'The sidebar stays on screen while the page scrolls; on a phone it opens as a drawer.',
    'Your name sits at the foot of the sidebar with a menu: Profile, the names switch, ' +
      "What's new and Sign out.",
    'A new Profile page shows your roles and your learning, and lets you change your team.',
    'Dropdowns, filters, tables and loading states look and work the same on every screen.',
    'Studio editors open full width, with the save state and Publish always in view.',
    'Admins can see every colour, size and component in Org settings, under Design system.',
  ],
} satisfies ChangelogEntry;
