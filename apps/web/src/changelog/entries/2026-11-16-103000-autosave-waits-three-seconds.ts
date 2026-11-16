import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-16',
  id: 'GH-119',
  title: 'Studio saves your draft three seconds after you stop typing',
  area: 'STUDIO',
  kind: 'ops',
  why: 'Every save rewrites the whole draft, answer keys included, so saving a second after each pause meant hundreds of full writes in a long editing session. Waiting a little longer cuts that to one write per pause.',
  detail: [
    'The editor says "unsaved changes" for about three seconds after an edit instead of one, then saves. Save and Publish still save at once.',
    'Closing the tab or reloading with unsaved changes still asks first, and now also keeps those edits on this device so they come back as a restore offer.',
  ],
} satisfies ChangelogEntry;
