import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-01',
  id: 'PAGINATION-EVERYWHERE',
  title: 'Long lists show 25 at a time, with Previous and Next',
  area: 'PLATFORM',
  kind: 'feature',
  why: 'Lists that grow with the organisation, such as the catalogue, certificates, teams, the question bank and the changelog, rendered every row at once, so a big list meant a long scroll and a slow page. Each now shows one page with a "Showing 1–25 of 148" line.',
  detail: [
    'Learners: the course catalogue, assigned courses on Home (replacing "Show all") and your certificates.',
    'Admins: the Overview course funnel, the Quizzes table on course analytics, and the team picker when assigning (replacing "Show more").',
    'Educators: courses, the media library, the question bank, Versions, Teams and the course Analytics people list.',
    'The changelog pages through changes; a release split across pages keeps its full count in the heading.',
    'Searching or changing a filter or tab returns you to page 1.',
  ],
} satisfies ChangelogEntry;
