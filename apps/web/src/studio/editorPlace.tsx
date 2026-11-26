import type { AuthoringSession, Item } from '@gurukul/schema';
import type { BreadcrumbItem } from '@gurukul/ui';
import { Link } from 'react-router';
import { useTerms } from '../labels/useTerms';
import { itemEditorPath, nameOf } from './studioModel';
import type { Working } from './types';

/**
 * Where an editor's working copy lives (`.plan/22-desktop-studio.md`, The session workspace: Edit
 * by hand). `draft` is Studio's own: the stored draft, through `useDraft`. `session` is a desktop
 * session's working copy, through `useSessionDraft`: the same editors, with links that stay in the
 * session and nothing that writes Firestore before Save to draft.
 */
export type EditorPlace =
  | { kind: 'draft'; courseId: string }
  | {
      kind: 'session';
      sessionId: string;
      /** Null for a new course, which has no id until its first save. */
      courseId: string | null;
      title: string;
    };

/** A session's workspace, opened on one lesson or Quiz (`item` is the preview's key, `lesson:l2`). */
export const sessionWorkspacePath = (sessionId: string, item?: string) =>
  `/studio/sessions/${sessionId}${item ? `?item=${encodeURIComponent(item)}` : ''}`;

/** Studio's lesson or Quiz editor over a session's working copy. Review links here too. */
export const sessionItemPath = (sessionId: string, itemId: string) =>
  `/studio/sessions/${sessionId}/items/${encodeURIComponent(itemId)}`;

/** Where a session's "Open in editor" goes for one lesson or Quiz. */
export type SessionEditPath = (item: Pick<Item, 'id' | 'type'>) => string;

/**
 * "Open in editor" for a session's lessons and Quizzes: Studio's editor over the working copy while
 * the session is open; once it is saved, Studio's own editor over the draft it was saved to, where
 * the work goes on. A discarded session has nothing to open.
 */
export function sessionEditPath(
  session: Pick<AuthoringSession, 'id' | 'status' | 'courseId'>,
): SessionEditPath | undefined {
  if (session.status === 'open') return (item) => sessionItemPath(session.id, item.id);
  // Only an edit session is saved, so a saved one has its course.
  const courseId = session.courseId as string;
  return session.status === 'saved' ? (item) => itemEditorPath(courseId, item) : undefined;
}

/**
 * Why a new course's editor offers no uploads: a file is stored under its course, and the course
 * has no id until the session's first Save to draft creates it.
 */
export const NEW_COURSE_UPLOADS =
  'Uploads open once the course is created, at the session’s first Save to draft. Link an image or file for now.';

export interface EditorLinks {
  /** Where the top bar's back link goes, and its words. */
  back: { to: string; label: string };
  /** The words of a button back there, under a "not found". */
  backWords: string;
  crumbs: BreadcrumbItem[];
  /** Another lesson's or Quiz's editor, for the rail. */
  itemPath(item: Item): string;
  /** The learner preview of an item, or null in a session: its workspace is the preview. */
  previewPath: string | null;
  /** The course uploads are stored under, or null when there is none yet. */
  uploadCourseId: string | null;
  /**
   * Things a session leaves out: reading the course's learner stats and saving to the question bank,
   * because a session reads the draft once and writes Firestore only at Save to draft.
   */
  firestore: boolean;
}

/** The editor's links and what it may offer, for the item `itemId` titled `itemTitle`. */
export function useEditorLinks(
  place: EditorPlace,
  work: Working,
  item: { id: string; key: string; title: string },
): EditorLinks {
  const t = useTerms();
  if (place.kind === 'draft') {
    const { courseId } = place;
    return {
      back: {
        to: `/studio/courses/${courseId}`,
        label: nameOf(work.course.title, 'Untitled course'),
      },
      backWords: 'Back to the course',
      crumbs: [
        { label: t.Studio, render: (p: object) => <Link to="/studio" {...p} /> },
        {
          label: work.course.title,
          render: (p: object) => <Link to={`/studio/courses/${courseId}`} {...p} />,
        },
        { label: item.title },
      ],
      itemPath: (i) => itemEditorPath(courseId, i),
      previewPath: `/studio/courses/${courseId}/preview/${item.id}`,
      uploadCourseId: courseId,
      firestore: true,
    };
  }
  const { sessionId } = place;
  const back = sessionWorkspacePath(sessionId, item.key);
  return {
    back: { to: back, label: 'Session' },
    backWords: 'Back to the session',
    crumbs: [
      { label: t.Studio, render: (p: object) => <Link to="/studio" {...p} /> },
      { label: place.title, render: (p: object) => <Link to={back} {...p} /> },
      { label: item.title },
    ],
    itemPath: (i) => sessionItemPath(sessionId, i.id),
    previewPath: null,
    uploadCourseId: place.courseId,
    firestore: false,
  };
}
