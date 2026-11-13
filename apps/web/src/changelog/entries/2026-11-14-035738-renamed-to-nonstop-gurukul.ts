import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-14',
  id: 'NONSTOP-GURUKUL-NAME',
  title: 'The platform is called NonStop Gurukul everywhere',
  area: 'PLATFORM',
  kind: 'feature',
  why:
    'It went by two names: NonStop Gurukul on the sign-in page and certificates, NonStop Academy ' +
    'in emails and the browser tab. One name is easier to recognise and to search your inbox for.',
  detail: [
    'Emails come from and talk about NonStop Gurukul.',
    'The home page tab reads NonStop Gurukul.',
    'The privacy page heading uses the same name.',
  ],
} satisfies ChangelogEntry;
