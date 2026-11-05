import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'STUDIO-SWITCHES-ON-OFF',
  title: 'Studio switches say what learners get, on or off',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'A switch that only described its on state left Educators guessing what learners see once it ' +
    'is off. Now the name and the line under it always describe what is true right now.',
  detail: [
    'Code blocks: Copy button or No copy button; Terminal style or Plain code.',
    'Video blocks: Captions are available or No captions.',
    'Image blocks: Open full size or No full-size view; Border or No border.',
    'Quiz settings: Shuffle answer order or Answers in your order; must pass to open the rest of the chapter, or can skip ahead.',
  ],
} satisfies ChangelogEntry;
