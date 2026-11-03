import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-03',
  id: 'REPORT-ISSUE',
  title: 'Report a failure on GitHub in one click',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'When something broke, the only way to tell us was an email in your own words, and it rarely ' +
    'said which page, which error or when. Now the report is written for you, with the codes we need ' +
    'to find the failure in our logs.',
  detail: [
    'Error messages, "This did not load" notes and the "Something went wrong" page have Report issue.',
    'It opens a bug on GitHub with what failed, the page, the error code and the time filled in; you add what you were doing and submit.',
    'The issue is public, so emails and long ids are taken out before it opens.',
  ],
} satisfies ChangelogEntry;
