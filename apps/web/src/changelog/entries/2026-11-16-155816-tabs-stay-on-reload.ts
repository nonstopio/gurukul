import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-16',
  id: 'GH-127',
  title: 'Reloading or sharing a link keeps the tab you were on',
  area: 'STUDIO',
  kind: 'fix',
  why: 'Reloading a course, or opening a link a colleague sent, always dropped you back on the first tab, so a link to Analytics or Versions could not be shared.',
  detail: [
    'The course editor (Structure, Landing page, Certificate, Analytics, Versions), the Learners page and the Studio course list remember their tab in the address.',
    'Filters in the address, such as the course on Learners, stay when the tab changes.',
  ],
} satisfies ChangelogEntry;
