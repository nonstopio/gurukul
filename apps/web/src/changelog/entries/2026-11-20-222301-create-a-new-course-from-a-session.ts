import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-20',
  id: 'AI-SESSIONS-NEW-COURSE',
  title: 'A course started with AI is created when you first save it',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'A new course built in a session had nowhere to go: there was no course to save it to. You ' +
    'now name it once the content exists, and the course is created and its draft saved in one ' +
    'step. If the save goes wrong after the course exists, you save again; the course is never ' +
    'created twice.',
  detail: [
    'In the desktop app, Review of a new course lists its outline and shows each lesson and Quiz as a learner sees it, since there is nothing to compare with.',
    'Create course and save draft asks for the title and the address, suggested from the title. The address cannot change later, and one already in use is said so, with the dialog kept open.',
    'From then on the session belongs to the new course: Edit with AI on that course opens it, and its draft is saved like any other.',
  ],
} satisfies ChangelogEntry;
