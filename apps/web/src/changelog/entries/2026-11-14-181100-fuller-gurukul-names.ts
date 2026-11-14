import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-14',
  id: 'GURUKUL-NAMES',
  title: 'More Gurukul labels, and a friendlier first choice',
  area: 'LEARN',
  kind: 'feature',
  why: 'Only eight words (the roles, Chapter, Quiz, Studio and Analytics) had Gurukul labels, so the Sanskrit set felt thin, and the first screen was two plain buttons that never said what the labels meant. People picked blind.',
  detail: [
    'Home, the catalogue, certificates, teams and the question bank now have Gurukul labels in the sidebar, the browser tab title and search results. The catalogue, Certificates, Teams, My teams, Question bank and the Studio course list carry them as page titles, and the course and team report breadcrumbs use them too. Course and lesson labels are in the dictionary but appear only in a few headings, not in lists, course titles or running text.',
    'The first screen, now titled "Which labels should Gurukul use?", is a side-by-side dictionary with the meaning of each Gurukul label, an owl that reacts as you look, and one click on the side you like to choose it. You can switch any time. The Studio is now Karyashala, the workshop.',
  ],
} satisfies ChangelogEntry;
