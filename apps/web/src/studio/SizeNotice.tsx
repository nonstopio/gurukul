import { COURSE_BYTES_LIMIT, COURSE_BYTES_WARN, courseBytes } from '@gurukul/schema';
import { Callout } from '@gurukul/ui';
import { useMemo } from 'react';
import type { DraftApi } from './useDraft';

const kb = (bytes: number) => Math.ceil(bytes / 1000).toLocaleString('en');

/**
 * Warns as the draft nears the size one course can hold, and says why it stopped saving once it is
 * over. Measured with the same `courseBytes` as autosave and `publishCourse`.
 */
export function SizeNotice({ draft }: { draft: Pick<DraftApi, 'work' | 'save'> }) {
  const { work, save } = draft;
  const bytes = useMemo(() => (work ? courseBytes(work.course, work.answers) : 0), [work]);
  const of = `${kb(bytes)} KB of the ${kb(COURSE_BYTES_LIMIT)} KB one course can hold`;
  if (save === 'too-large' || bytes > COURSE_BYTES_LIMIT) {
    return (
      <Callout tone="warning" title="This course is too large to save" role="alert">
        <p>
          It is {of}. Your latest edits stay on this page and this device but are not saved. Remove
          some content, or move chapters into a second course, and it saves again.
        </p>
      </Callout>
    );
  }
  if (bytes <= COURSE_BYTES_WARN) return null;
  return (
    <Callout tone="tip" title="This course is nearly full">
      <p>It is {of}. Consider moving some chapters into a second course before it stops saving.</p>
    </Callout>
  );
}
