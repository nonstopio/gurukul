import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'DROPDOWNS-MATCH-GURUKUL',
  title: 'Dropdowns open a Gurukul list, not the browser’s',
  area: 'DESIGN',
  kind: 'feature',
  why:
    'An open dropdown showed the operating system’s own list, which looked nothing like ' +
    'Gurukul and differed from one browser to the next. Every dropdown now opens the same ' +
    'list, in both themes, with a tick on the current choice.',
  detail: [
    'Arrow keys, Home, End, Page Up and Page Down move; Enter or Space chooses; Escape closes without a change.',
    'Typing the first letters of an option jumps to it.',
    'Inside a dialog the list is never cut off; near the bottom of the screen it opens upwards.',
  ],
} satisfies ChangelogEntry;
