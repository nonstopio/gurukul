import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-30',
  id: 'PHANTOM-EDIT',
  title: 'Studio no longer reports an unpublished edit nobody made',
  area: 'STUDIO',
  kind: 'fix',
  why:
    'When an Admin changed who could edit a course, the course card said "1 unpublished edit" ' +
    'forever, even straight after publishing, so an Educator went looking for a change that did not exist.',
  detail: [
    'The course card and the publish summary count only changes to the content and settings, not the list of Educators.',
    'A draft saved before an update to how courses are stored no longer counts as edited after publishing.',
  ],
} satisfies ChangelogEntry;
