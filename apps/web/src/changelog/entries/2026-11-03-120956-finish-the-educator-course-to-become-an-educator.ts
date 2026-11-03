import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-03',
  id: 'EDUCATOR-COURSE',
  title: 'An Admin can assign "Becoming a Gurukul Educator"; finishing it makes you an Educator',
  area: 'LEARN',
  kind: 'feature',
  why:
    'An Admin granting the Educator role by hand gave new Educators nothing to learn from. Now ' +
    'the Admin assigns a short course that teaches how to build a good course here, and finishing ' +
    'it grants the role.',
  detail: [
    'A new course, "Becoming a Gurukul Educator": seven chapters and about 80 minutes covering every part of Studio, with weak and better examples, a Quiz midway and a Final Quiz.',
    'It is not in the catalogue. An Admin assigns it, which lets that person open it.',
    'Finish it and you become an Educator straight away, with a certificate. The completion screen congratulates you and opens Studio.',
    'Admins can still grant or remove the Educator role by hand.',
  ],
} satisfies ChangelogEntry;
