import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-19',
  id: 'GH-171',
  title: 'Gurukul Studio, the desktop app, keeps itself up to date',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'An Educator who installs the desktop app should never have to look for a newer download. ' +
    'Each new version is published once and reaches every installed copy on its own, without a ' +
    'prompt interrupting the work.',
  detail: [
    'The app looks for a new version when it starts and every six hours, and downloads it quietly.',
    'When one is ready, the sidebar shows Update ready: choose it to restart into the new version, or it installs the next time you quit. Check for updates… in the app menu asks straight away.',
    'If this site ever needs a newer app than the one installed, the sidebar says Update the app.',
    'Nothing changes in the browser.',
  ],
} satisfies ChangelogEntry;
