import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-20',
  id: 'AI-SESSIONS-SAVE',
  title: 'Save a session’s work to the draft in one step',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'A session’s changes stayed on your laptop until now, so the course never got them. Saving ' +
    'writes them all to the draft at once, after you have reviewed them, and never over a draft ' +
    'someone else saved meanwhile: their work is brought in first, with you choosing where the ' +
    'two of you changed the same thing.',
  detail: [
    'In the desktop app, Review’s Save to draft replaces the draft with the session’s version in one write, after a confirmation. Learners see nothing until you publish.',
    'The button says why it waits: a course that is not valid or is over the size limit, a turn still running, or a draft saved by someone else after the session started.',
    'Bring in their changes takes what only they changed and asks, for each thing both of you changed, whether to keep this session’s or theirs, showing both. Then Review compares with their draft and Save is offered again.',
    'Once saved, the session shows what was saved, with Open the course editor and Publish.',
  ],
} satisfies ChangelogEntry;
