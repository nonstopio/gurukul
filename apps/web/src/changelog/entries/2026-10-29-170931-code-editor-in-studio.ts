import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-29',
  id: 'STUDIO-CODE-EDITOR',
  title: 'Studio edits Markdown and code in a real editor',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Code and Markdown were typed into a plain box, so a missing bracket or a wrong indent only ' +
    'showed up after the lesson was previewed.',
  detail: [
    'Text and code blocks use a code editor with syntax colours for the block language.',
    'Tab indents, undo and redo work as in any editor, and the formatting toolbar still wraps the selection.',
  ],
} satisfies ChangelogEntry;
