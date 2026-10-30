import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'SHELL-AREAS-MOTION',
  title: 'Switch between Learn, Studio and Admin, with a calmer, moving interface',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'The sidebar mixed three areas into one long list, the design system hid inside Org settings, and ' +
    'pages appeared with no sense of where they came from.',
  detail: [
    'A switcher at the top of the sidebar moves between the areas you can open; the sidebar lists the pages of the one you are in.',
    'The design system is its own Admin page; old Org settings links still find it.',
    'Your account menu now shows your name, email and role, and pages, menus and dialogs ease in (not when your device asks for reduced motion).',
  ],
} satisfies ChangelogEntry;
