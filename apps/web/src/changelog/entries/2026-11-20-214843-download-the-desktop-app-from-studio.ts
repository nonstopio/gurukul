import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-20',
  id: 'AI-SESSIONS-DOWNLOAD',
  title: 'Studio offers the desktop app for building a course by chatting',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'Building a course by chatting happens in the Gurukul Studio desktop app, and nothing in the ' +
    'browser said it existed or where to get it. Now the place you start courses names it and ' +
    'hands you the right installer.',
  detail: [
    'The Studio sidebar has a Desktop app page, in the browser, that shows Build a course by chatting: the latest version, the installer for your computer first (Apple Silicon or Intel Mac, or Windows), its three install steps, the other installers and every release on GitHub.',
    'When GitHub cannot be reached or no release is out yet, the card links to the releases page instead. The course list stays clear of it; in the desktop app it shows New course with AI and Edit with AI.',
    'A feature tip points at the download the first time you open the page.',
  ],
} satisfies ChangelogEntry;
