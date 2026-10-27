import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-27',
  id: 'M4-KULAPATI-CONSOLE',
  title: 'Kulapatis can assign courses, see who is learning and manage roles',
  area: 'KULAPATI',
  kind: 'feature',
  why:
    'Running a learning programme needs more than a catalogue. Kulapatis can now give a course to ' +
    'a whole list of people at once (including people who have not signed in yet), see who is ' +
    'behind, nudge them, and decide who may build courses, all without asking an engineer.',
  detail: [
    'Assign courses by pasting emails, uploading a CSV, searching people or picking a team; the preview shows who has signed in, who is new, who already has the course and who was rejected before anything is saved.',
    'Learners lists everyone who signed in plus pending invites, with filters, bulk reminders and a drawer to reset a Pariksha cooldown or revoke a certificate.',
    'The overview shows active learners, completion, overdue work and a weekly chart; each course has a funnel that points to where learners stop and the hardest questions.',
    'Roles & access grants or removes Acharya and Kulapati roles, and an Acharya is given the specific courses they may edit. You cannot remove your own Kulapati role.',
    'Assignment and reminder emails are queued, but nothing is sent yet: that needs a decision on the mail service.',
  ],
  notes: [
    'Every figure on the overview comes from counter documents kept by the server, so opening the page costs a handful of reads rather than one per learner.',
  ],
} satisfies ChangelogEntry;
