import { workingSchema } from '@gurukul/schema';
import type { Course } from '@gurukul/schema';
import { courseChanges } from '@gurukul/schema/changes';
import type { ChangeRow, CourseChanges } from '@gurukul/schema/changes';
import { mergeWorking, resolveConflicts } from '@gurukul/schema/merge';
import type { ConflictChoices, MergeConflict, MergeResult, OrderKept } from '@gurukul/schema/merge';
import { log } from '../../log';
import { DraftConflictError } from '../errors';
import type { DraftDoc, StudioData, Working } from '../types';
import type { AgentSession, AgentSessionView, SessionBase } from './agent';
import { fieldName } from './review';
import type { CheckState, Numbers } from './review';

/*
 * Save to draft (`.plan/22-desktop-studio.md`, Save to draft), without React: what the session
 * knows of the stored draft, the words for it, why Save waits, the save itself through Studio's own
 * `saveDraft` (the same `rev` check in a transaction and `answersChanged` marking as the editors'
 * autosave), and Bring in their changes over `@gurukul/schema/merge`. Nothing logged carries course
 * text, a name or an answer key.
 */

// ─── The stored draft ────────────────────────────────────────────────────────────────────────────

/** The read of the stored draft: under way, failed, or what it found. */
export type DraftRead =
  { state: 'checking' } | { state: 'failed' } | { state: 'read'; stored: DraftDoc };

/** What the session knows of the stored draft against its base. */
export type DraftCheck =
  /** Nothing to compare: a new course has no draft yet, and a closed session is not checked. */
  | { state: 'none'; why: 'new' | 'closed' }
  | { state: 'checking' }
  /** It could not be read; Save still checks it in its own transaction. */
  | { state: 'failed' }
  | { state: 'current'; stored: DraftDoc }
  /** Saved by someone (or in the browser) after the session started: Save waits for the merge. */
  | { state: 'moved'; stored: DraftDoc };

/** The check, from the session and the last read of the stored draft. */
export function draftCheck(
  session: Pick<NonNullable<AgentSessionView['session']>, 'status' | 'base'>,
  read: DraftRead | null,
): DraftCheck {
  if (session.status !== 'open') return { state: 'none', why: 'closed' };
  if (session.base === null) return { state: 'none', why: 'new' };
  if (read === null || read.state === 'checking') return { state: 'checking' };
  if (read.state === 'failed') return { state: 'failed' };
  return read.stored.rev === session.base.rev
    ? { state: 'current', stored: read.stored }
    : { state: 'moved', stored: read.stored };
}

/** Who saved the stored draft, as a sentence names them: "you", a name, or "someone else". */
export function saverName(stored: DraftDoc, uid: string): string {
  if (stored.updatedBy === uid) return 'you';
  return stored.course.educatorNames[stored.updatedBy]?.trim() || 'someone else';
}

/** When it was saved: "at 14:10" today, "on 18 Nov at 14:10" another day; null when unknown. */
export function savedWhen(at: Date | null, now: Date): string | null {
  if (at === null) return null;
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (at.toDateString() === now.toDateString()) return `at ${time}`;
  const day = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `on ${day} at ${time}`;
}

/** "The draft was saved by Arjun at 14:10, after this session started." */
export function movedLine(stored: DraftDoc, uid: string, now: Date): string {
  const when = savedWhen(stored.updatedAt, now);
  return `The draft was saved by ${saverName(stored, uid)}${when ? ` ${when},` : ''} after this session started.`;
}

/** Review's "Draft is up to date" line. */
export function draftCheckLine(check: DraftCheck): { state: CheckState; title: string } {
  switch (check.state) {
    case 'none':
      return {
        state: 'info',
        title:
          check.why === 'new'
            ? 'Draft is up to date: a new course has no draft yet'
            : 'Draft is up to date: not checked once a session is closed',
      };
    case 'checking':
      return { state: 'info', title: 'Draft is up to date: checking…' };
    case 'failed':
      return { state: 'warn', title: 'Draft is up to date: could not be checked' };
    case 'current':
      return { state: 'pass', title: 'Draft is up to date' };
    case 'moved':
      return { state: 'fail', title: 'The draft moved since this session started · stops Save' };
  }
}

// ─── Save ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Why Save to draft cannot be pressed now, in words; null when it can. `blockers` are the checks that
 * stop a save (`saveBlockers`), `changes` the rows against the base.
 */
export function saveWaits(
  view: Pick<AgentSessionView, 'status' | 'canSave' | 'saving' | 'handEdits'>,
  check: DraftCheck,
  blockers: readonly string[],
  changes: number,
): string | null {
  if (view.saving) return null;
  if (blockers.includes('Course is valid'))
    return 'The course is not valid yet. Ask the agent to check it, or undo the turn that broke it.';
  if (blockers.includes('Size')) return 'The course is over the size limit. Make it smaller first.';
  if (check.state === 'moved') return 'Bring in their changes first.';
  if (changes === 0) return 'Nothing has changed yet.';
  if (view.canSave) return null;
  if (view.handEdits !== null) return 'Leave the editor first: its edits become a turn then.';
  if (view.status === 'connecting') return 'Wait while the agent starts.';
  if (view.status === 'undoing' || view.status === 'editing')
    return 'Wait while the last change is written.';
  return 'Wait for the agent to finish this turn.';
}

/** What a failed save says: why, in plain words, never the error's own text. */
export function saveFailure(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'permission-denied')
    return 'Gurukul refused the save: you may no longer be allowed to change this course. Nothing was written, and the session is kept on this computer.';
  if (code === 'unavailable' || code === 'deadline-exceeded')
    return 'Gurukul could not reach the server. Check the connection and try again; the session is kept on this computer.';
  return 'The draft could not be saved. Try again; the session is kept on this computer.';
}

export type SaveOutcome =
  /** Written as `rev`; `kept` is false when this computer could not mark the session saved. */
  | { status: 'saved'; rev: number; kept: boolean }
  /** The stored draft moved meanwhile: `stored` as read again, null when it could not be read. */
  | { status: 'moved'; stored: DraftDoc | null }
  | { status: 'refused'; reason: 'busy' | 'new_course' | 'invalid' }
  | { status: 'failed'; message: string };

/**
 * Save to draft: the session's working copy through Studio's own `saveDraft`, the only Firestore
 * write a session makes. A draft saved meanwhile (`DraftConflictError`) is read again, so the page
 * offers the merge; any other failure is logged once and said in words.
 */
export async function saveSession(
  agent: Pick<AgentSession, 'saveToDraft'>,
  data: Pick<StudioData, 'saveDraft' | 'getDraft'>,
  ids: { uid: string; sessionId: string; courseId: string },
): Promise<SaveOutcome> {
  const { uid, sessionId, courseId } = ids;
  const result = await agent.saveToDraft((work, baseRev) =>
    data.saveDraft(courseId, work, baseRev, uid),
  );
  if (result.ok) return { status: 'saved', rev: result.rev, kept: result.kept };
  if (result.reason !== 'error') return { status: 'refused', reason: result.reason };
  if (result.error instanceof DraftConflictError) {
    log.warn('Session draft moved before save', { sessionId, courseId });
    try {
      return { status: 'moved', stored: await data.getDraft(courseId) };
    } catch {
      log.warn('Session draft not checked', { sessionId, courseId });
      return { status: 'moved', stored: null };
    }
  }
  log.error('Session save to draft failed', result.error, { sessionId, courseId });
  return { status: 'failed', message: saveFailure(result.error) };
}

// ─── Bring in their changes ──────────────────────────────────────────────────────────────────────

/** The stored draft as a working copy, its mark kept. */
export function workOfDraft(doc: DraftDoc): Working {
  return {
    course: doc.course,
    answers: doc.answers,
    ...(doc.answersChanged ? { answersChanged: true as const } : {}),
  };
}

/** The stored draft as the session's new base. */
export function baseOfDraft(doc: DraftDoc): SessionBase {
  return { rev: doc.rev, savedAt: doc.updatedAt?.toISOString() ?? null, work: workOfDraft(doc) };
}

/** The merge of this session (`work`) with the stored draft, against the session's base. */
export const mergeWithDraft = (base: Working, work: Working, stored: DraftDoc): MergeResult =>
  mergeWorking(base, work, workOfDraft(stored));

/** A conflict's name, numbered like the outline from this session's copy where it has one. */
export function conflictName(conflict: MergeConflict, numbers: Numbers): string {
  if (conflict.kind === 'field') {
    const owner = conflict.row === 'course' ? 'Course details' : 'Landing page';
    return `${owner} · ${conflict.field === 'outcomes' ? 'Outcomes' : fieldName(conflict.field)}`;
  }
  // A conflict is something at least one side still has: removed on both is no conflict.
  const thing = (conflict.mine ?? conflict.theirs) as { title: string };
  const title = thing.title.trim() || 'Untitled';
  const number =
    conflict.mine === null
      ? undefined
      : conflict.kind === 'chapter'
        ? numbers.chapters.get(conflict.id)
        : numbers.items.get(`${conflict.kind}:${conflict.id}`);
  return number ? `${number} · ${title}` : title;
}

/** Why a conflict is one, in words; `who` from `saverName`. */
export function conflictReason(conflict: MergeConflict, who: string): string {
  switch (conflict.reason) {
    case 'removedInMine':
      return `This session removed it, and ${who} changed it in the draft.`;
    case 'removedInTheirs':
      return `This session changed it, and ${who} removed it from the draft.`;
    case 'both':
      return conflict.base === null || conflict.base === undefined
        ? `This session and ${who} both added it, differently.`
        : `This session and ${who} both changed it, differently.`;
  }
}

/** A list both sides reordered, said in words: this session's order is kept. */
export function orderLine(order: OrderKept, course: Course, numbers: Numbers): string {
  if (order.list === 'chapters')
    return 'Both changed the order of the chapters: this session’s order is kept.';
  const chapter = course.chapters.find((c) => c.id === order.chapterId);
  const number = numbers.chapters.get(order.chapterId);
  const name = chapter && number ? `chapter ${number} · ${chapter.title}` : 'a chapter';
  return `Both changed the order in ${name}: this session’s order is kept.`;
}

/** Each side's changes against the base, as Review lists them: worked out once per merge. */
export interface MergeSides {
  mine: CourseChanges;
  theirs: CourseChanges;
}

export const mergeSides = (result: MergeResult): MergeSides => ({
  mine: courseChanges(result.base, result.mine),
  theirs: courseChanges(result.base, result.theirs),
});

/** The other type's key for one id: a lesson on one side may be a Quiz on the other. */
const otherKind = (key: string) =>
  key.startsWith('lesson:') ? `quiz:${key.slice(7)}` : `lesson:${key.slice(5)}`;

/**
 * The Review rows a conflict stands for on one side: the item, chapter or field as that side
 * changed it from the base. A field conflict keeps only its field of the course details or landing
 * page row; an item conflict also takes the row of the other type under the same id.
 */
export function conflictRows(conflict: MergeConflict, changes: CourseChanges): ChangeRow[] {
  if (conflict.kind === 'field') {
    // Both sides changed the field, so each has the row it belongs to.
    const row = changes.rows.find((r) => r.kind === conflict.row) as Extract<
      ChangeRow,
      { kind: 'course' | 'landing' }
    >;
    if (row.kind === 'course')
      return [{ ...row, fields: row.fields.filter((f) => f.field === conflict.field) }];
    return [
      conflict.field === 'outcomes'
        ? { ...row, fields: [] }
        : { ...row, fields: row.fields.filter((f) => f.field === conflict.field), outcomes: [] },
    ];
  }
  const keys =
    conflict.kind === 'chapter' ? [conflict.key] : [conflict.key, otherKind(conflict.key)];
  return changes.rows.filter((r) => keys.includes(r.key));
}

/** The line a merge leaves in the chat and the turn list. */
export const bringInSummary = (stored: DraftDoc, who: string): string =>
  `Brought in Draft v${stored.rev}, saved by ${who}`;

export type BringInOutcome = 'done' | 'invalid' | 'failed';

/**
 * Bring in their changes: the merged copy (conflicts settled by `choices`) becomes the working copy
 * and the stored draft the base. `invalid` when the two together do not fit a course (31 chapters,
 * say): a session file only ever holds a course the schema accepts, so nothing is written.
 */
export async function bringInDraft(
  agent: Pick<AgentSession, 'bringIn'>,
  stored: DraftDoc,
  result: MergeResult,
  choices: ConflictChoices,
  who: string,
): Promise<BringInOutcome> {
  const work = result.working ?? resolveConflicts(result, choices);
  if (!workingSchema.safeParse(work).success) return 'invalid';
  const done = await agent.bringIn(
    baseOfDraft(stored),
    work as Working,
    bringInSummary(stored, who),
  );
  return done ? 'done' : 'failed';
}
