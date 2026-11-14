import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-14',
  id: 'OWL-MASCOT-EVERYWHERE',
  title: 'The owl now keeps you company across Gurukul',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'Empty lists, missing pages and failed loads felt cold and all looked alike. A friendly face ' +
    'that reacts to the moment makes it clearer at a glance whether something went well, is ' +
    'missing or needs another try, without adding words.',
  detail: [
    'Empty lists, missing pages and missing records show a curious owl.',
    'When something does not load or save, a downcast owl sits beside Retry and Report issue.',
    'A passed Quiz and a finished course get a celebrating owl; a missed Quiz gets a wink and a tip, never a sad face.',
    'Notifications, feature tips and delete confirmations in Studio show the owl’s face, and Gurukul shows the waddling owl while it signs you in.',
    'Answer feedback in lessons and Quizzes shows the owl: a happy face when you are right and a wink to try again when you are not. Notes and tips in lessons, confirmation dialogs and the offline banner show it too.',
    'A toggle button that is on, such as Preview in the Studio text editor, now takes the green selection look, so you can tell at a glance that it is on.',
  ],
} satisfies ChangelogEntry;
