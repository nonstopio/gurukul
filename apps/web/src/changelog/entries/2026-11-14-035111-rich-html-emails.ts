import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-14',
  id: 'RICH-HTML-EMAILS',
  title: 'Gurukul emails are now designed pages with a button and clear due dates',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'Every email was plain text, so a due date or a link was easy to miss. They now look like ' +
    'NonStop Gurukul and put the course, the date and one button to open it in front of you.',
  detail: [
    'Course assigned, reminder, deadline and certificate revoked emails share one branded layout.',
    'Each course is a card with its title, a "Finish by" or "Was due" line and an Open course link.',
    'Overdue courses are marked red and courses due soon amber.',
    'Email templates in the Admin console previews the real email, with the plain-text version below it.',
  ],
} satisfies ChangelogEntry;
