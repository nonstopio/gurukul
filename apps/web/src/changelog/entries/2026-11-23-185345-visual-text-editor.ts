import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-23',
  id: 'GH-167',
  title: 'Edit lesson text as formatted text, not Markdown',
  area: 'STUDIO',
  kind: 'feature',
  why: 'Educators who do not know Markdown had to type asterisks and hash signs to bold a word or make a heading, and could not see the result until they pressed Preview.',
  detail: [
    'Text blocks, Callout text and the course description open in a visual editor with a toolbar: bold, italic, strikethrough, headings, lists, links, quotes, code blocks, undo and redo.',
    'Text the visual editor cannot keep exactly (raw HTML, unusual links) is shown as plain Markdown with a warning and is never rewritten just by opening it.',
    'Underline is not offered, because Markdown has no underline. Links may only point to http, https or mailto addresses.',
    'Learners now see strikethrough, tables and task lists in lesson text.',
  ],
} satisfies ChangelogEntry;
