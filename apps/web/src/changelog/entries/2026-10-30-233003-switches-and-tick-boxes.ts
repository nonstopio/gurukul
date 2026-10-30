import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'DESIGN-SWITCHES',
  title: 'Switches and tick boxes are drawn by us, with no browser checkboxes left',
  area: 'DESIGN',
  kind: 'feature',
  why:
    'Roles were granted with plain browser checkboxes that clashed with the rest of the app and gave ' +
    'no feedback, so a setting did not feel like it had changed.',
  detail: [
    'Educator and Admin are cards with the role and what it does on the left and a switch at the right edge; click anywhere on the card.',
    'Ticking rows, imported questions and correct answers uses a drawn tick box that fills and pops in.',
  ],
} satisfies ChangelogEntry;
