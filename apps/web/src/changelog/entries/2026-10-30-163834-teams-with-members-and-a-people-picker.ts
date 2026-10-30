import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'TEAMS',
  title: 'Admins keep teams with their members, and pick people in Assign by typing',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'A team was only a name typed into Org settings, so it had nobody on it and Assign courses ' +
    'could not tell who to give a course to. The people search there also left its list open and ' +
    'its text behind after a choice.',
  detail: [
    'A Teams page lists every team with its member count; Create team takes a name and member emails pasted in, each marked signed in, invited or invalid.',
    'Edit a team to change its name or members; Delete asks first. Teams made before this show up with no members until you add some.',
    'Assign courses lists these teams, and adding a team adds its listed members plus anyone who picked it on their profile.',
    'Searching people in Assign: pick someone and they become a chip, the box clears and the list closes.',
    'The team list moved out of Org settings, which keeps the reminders and the certificate signatory.',
  ],
} satisfies ChangelogEntry;
