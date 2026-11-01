import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-01',
  id: 'THEME-SWITCHER-TOP-RIGHT',
  title: 'Switch between Light, System and Dark from the top right of every page',
  area: 'PLATFORM',
  kind: 'feature',
  why: 'Changing the theme meant opening the account menu and stepping through three choices one tap at a time. Reading in a bright room or at night is when you want it fastest.',
  detail: [
    'A Light, System and Dark switch sits at the top right of every page, including lessons, Quizzes and the Studio editors.',
    'Your choice is remembered on this device, as before. The Theme item left the account menu.',
    'Changelog is no longer in the sidebar; open it from "What\'s new" in the account menu.',
    'An account with no Google name now shows a name made from the email, so the menu and Profile no longer print the email twice.',
  ],
} satisfies ChangelogEntry;
