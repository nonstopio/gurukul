import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-14',
  id: 'OWL-MASCOT-PAGE',
  title: 'The owl mascot has its own Admin page',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'Anyone placing the owl on a screen needs to see every face and know which moment calls for ' +
    'which one, so it reacts the same way everywhere and never looks sad at a wrong answer.',
  detail: [
    'Admin → Mascot, after Design system, shows all 24 expressions: pick one to see it large, whole, face only or waddling.',
    'Pick a state to see the face it uses, a line of copy that goes with it and when to use it.',
    'The loaders can be paused, and the owl is shown on a light and a dark ground side by side.',
    'Usage rules and code you can copy sit at the end.',
    'Design system has an Alerts section whose buttons raise each toast, the confirm and update dialogs and the loading overlay.',
  ],
} satisfies ChangelogEntry;
