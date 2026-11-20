import {
  SESSION_CHECKPOINTS_KEPT,
  SESSION_FILES_DAYS,
  SESSION_SCHEMA_VERSION,
  authoringSessionSchema,
  blankCourse,
  courseSchema,
  sessionBaseSchema,
  slug,
  workingSchema,
} from '@gurukul/schema';
import type { AuthoringSession, TimestampLike, Turn, WorkingCopy } from '@gurukul/schema';
import { z } from 'zod';
import { bridgeFailure, isAgentSessionFile } from '../../desktop/bridge';
import type { GurukulDesktop } from '../../desktop/bridge';
import { log } from '../../log';
import type { DraftDoc } from '../types';
import { TRANSCRIPT_FILE, parseTranscript, transcriptText } from './transcript';
import type { TranscriptEntry } from './transcript';

/*
 * The session store (`.plan/22-desktop-studio.md`, Sessions): an Educator's authoring sessions as
 * files on their laptop, read and written through the desktop bridge's `store.*` and nothing else.
 * Firestore is never written here; starting an edit session reads the draft once, through the
 * `getDraft` it is handed.
 *
 *   sessions/{uid}/{sessionId}/session.json            the session (`authoringSessionSchema`)
 *   sessions/{uid}/{sessionId}/checkpoints/{file}      the working copy after a turn, newest 30 kept
 *   sessions/{uid}/{sessionId}/checkpoints/start.json  the working copy before the first turn
 *   sessions/{uid}/{sessionId}/checkpoints/{file}      the base before a turn that moved it
 *   sessions/{uid}/{sessionId}/transcript.jsonl        the chat (`transcript.ts`)
 *   sessions/{uid}/{sessionId}/editing.json            hand edits not yet a turn: the copy before them
 *   sessions/{uid}/{sessionId}/agent-note.json         what the agent is told with the next message
 *   sessions/{uid}/{sessionId}/creating.json           the address a new course is being created at
 *   sessions/{uid}/{sessionId}/created.json            a new course's draft, once `createCourse` made it
 *   sessions/{uid}/{sessionId}/answer-check.json       second opinions on Quiz answers (`DSK-18`)
 *   sessions/{uid}/{sessionId}/history.json            what is kept 30 days after it was closed
 *   sessions/{uid}/{sessionId}/unreadable.json         when `sweep` first found the folder unreadable
 *
 * The files hold answer keys: nothing here logs a title, a goal, course text or a key, only ids,
 * counts and reasons.
 */

/** Where a session opens in the app. */
export const sessionPath = (sessionId: string) => `/studio/sessions/${sessionId}`;

/** The session itself, inside the session's folder. */
export const SESSION_FILE = 'session.json';
/** What stays of a session once its files are removed: title, summary and counts. */
export const HISTORY_FILE = 'history.json';
/**
 * When `sweep` first found a folder it cannot read (a `session.json` that is damaged or from a newer
 * app, or neither a session nor a history): the whole folder goes 30 days later, because its
 * checkpoints hold answer keys.
 */
export const UNREADABLE_FILE = 'unreadable.json';
/** Where a turn's checkpoint lives, inside the session's folder. */
export const checkpointPath = (file: string) => `checkpoints/${file}`;
/**
 * The checkpoint before the first turn, so Undo can take a session back to where it started. Kept
 * whatever the number of turns; a turn's own checkpoint is named by its id, which is never `start`.
 */
export const START_CHECKPOINT = 'start.json';

/**
 * Hand edits made in Studio's editors that are not a turn yet (`DSK-19`): the working copy from
 * before them. Written before the first hand edit reaches `session.json` and removed once they are
 * a turn, so a session opened after the app closed mid-edit still makes them one.
 */
export const EDITING_FILE = 'editing.json';

/**
 * What the agent has not been told yet (`DSK-19`): turns undone and hand edits made since its last
 * message. Written when either happens and removed once a message carries the note, so an app
 * closed in between still tells it (`undoNote`, `HAND_EDIT_NOTE` in `agent.ts`).
 */
export const AGENT_NOTE_FILE = 'agent-note.json';

/**
 * A new-course session's created course (`DSK-16`): the draft `createCourse` wrote (`createdBase`),
 * written as soon as the course exists and before `session.json` makes the session an edit session
 * on it, so a session that could not note it, opened again later, saves it without creating the
 * course twice. Read only while the session is still a new course with no base.
 */
export const CREATED_FILE = 'created.json';

/**
 * A new-course session's attempt to create its course (`DSK-28`): the address and title asked of
 * `createCourse`, and since when, written before the call. When the app closed (or could keep
 * neither `created.json` nor `session.json`) after the course was created but before the session
 * noted it, the next attempt at that address finds it taken; this note is what lets the session
 * read the draft there once and recognise the blank course it made (`ownCreatedBase` in
 * `save.ts`), instead of saying the address is taken. Read only while the session has no base.
 */
export const CREATING_FILE = 'creating.json';

/**
 * The answer check (`DSK-18`): each second opinion by its question's hash (`answers.ts`), so it is
 * asked once per question and again only when that question or its lessons change, and whether
 * the Educator skipped the check for this session. Removed with the session's other files.
 */
export const ANSWER_CHECK_FILE = 'answer-check.json';
/** Most second opinions kept, the newest first: far more than a session changes questions. */
export const ANSWER_RESULTS_KEPT = 500;

const DAY_MS = 86_400_000;
/** A goal is one box of free text, held to what `goalSchema` stores. */
export const GOAL_MAX_LENGTH = 300;
/** A title made from the goal is cut here, on a word, so it fits a top bar. */
const TITLE_LENGTH = 80;
/** The working course of a new-course session, until the first save gives it its slug. */
export const NEW_COURSE_ID = 'new-course';
/** A new-course session's course title until the agent or the Educator gives it one. */
export const NEW_COURSE_TITLE = 'Untitled course';

/** The `rev` of the draft `createCourse` writes for a new course (`firebase/functions/src/stores.ts`). */
export const CREATED_DRAFT_REV = 1;

/**
 * The name `createCourse` gives the course's first Educator (`displayName` in
 * `firebase/functions/src/courses.ts`): the Google name, else the email's local part; none when
 * neither is known.
 */
export function creatorName(user: {
  displayName: string | null;
  email: string | null;
}): string | undefined {
  return user.displayName?.trim() || user.email?.split('@')[0] || undefined;
}

/**
 * The working copy as part of the course it belongs to: the course's own fields that Studio and
 * publishing keep (id, Educators, status, version, `publishedAt`) taken from `owner`, as a merge
 * takes them from the stored draft. A new-course session's copies from before the course was
 * created (`DSK-16`) carry the placeholder id; this gives them the course's.
 */
export function onCourse<W extends WorkingCopy>(work: W, owner: WorkingCopy['course']): W {
  const { id, educatorIds, educatorNames, status, version, publishedAt } = owner;
  return {
    ...work,
    course: { ...work.course, id, educatorIds, educatorNames, status, version, publishedAt },
  };
}

/**
 * A new-course session's working copy once its course is created (`DSK-16`): on that course
 * (`onCourse`), with the title the Educator gave it, and the certificate title and cover letter
 * the placeholder "Untitled course" gave it, where nothing changed them since, made the course's
 * own (`created` is the blank course `createCourse` wrote, which derives both from the title).
 */
export function asCreated<W extends WorkingCopy>(work: W, created: WorkingCopy['course']): W {
  const owned = onCourse(work, created);
  const { course } = owned;
  const placeholder = blankCourse({
    id: NEW_COURSE_ID,
    title: NEW_COURSE_TITLE,
    level: course.level,
    theme: course.cover.theme,
    educatorId: '',
  });
  return {
    ...owned,
    course: {
      ...course,
      title: created.title,
      certificate:
        course.certificate.title === placeholder.certificate.title
          ? { ...course.certificate, title: created.certificate.title }
          : course.certificate,
      cover:
        course.cover.glyph === placeholder.cover.glyph
          ? { ...course.cover, glyph: created.cover.glyph }
          : course.cover,
    },
  };
}

/**
 * The course a new-course session is put on (`asCreated`), named as the Educator named it last
 * (`DSK-28`): `created` is the blank course `createCourse` wrote, and `note` the session's last
 * attempt at its address. When an earlier attempt made the course and this one found it, the title
 * typed this time is the one kept, with the certificate title and cover letter `createCourse`
 * derives from it; the stored draft keeps its own, so Save writes the new title as a change.
 * `created` itself when the note is for another address or gives the same title.
 */
export function namedCourse(
  created: WorkingCopy['course'],
  note: CreatingNote | null,
): WorkingCopy['course'] {
  if (note === null || note.slug !== created.id || note.title === created.title) return created;
  const named = blankCourse({
    id: created.id,
    title: note.title,
    level: created.level,
    theme: created.cover.theme,
    educatorId: '',
  });
  return {
    ...created,
    title: named.title,
    certificate: { ...created.certificate, title: named.certificate.title },
    cover: { ...created.cover, glyph: named.cover.glyph },
  };
}

/**
 * The draft `createCourse` has just written for a new-course session's course (`DSK-16`): a blank
 * course with the title and address the Educator chose, the session's level, cover theme and
 * Educator, at `CREATED_DRAFT_REV`. Built here rather than read, so nothing stands between the
 * course being created and the session noting it; Save's own transaction checks the `rev`.
 */
export function createdBase(
  work: WorkingCopy,
  init: {
    courseId: string;
    title: string;
    uid: string;
    /** The Educator's name as `createCourse` takes it (`creatorName`). */
    educatorName: string | undefined;
    at: string;
  },
): SessionBase {
  const { course } = work;
  return {
    rev: CREATED_DRAFT_REV,
    savedAt: init.at,
    work: {
      course: blankCourse({
        id: init.courseId,
        title: init.title,
        level: course.level,
        theme: course.cover.theme,
        educatorId: init.uid,
        educatorName: init.educatorName,
      }),
      answers: {},
    },
  };
}

const at = z.iso.datetime({ offset: true });

/**
 * A session after its files were removed: no course, no keys, no chat. Kept so the person can
 * still see what they worked on (`.plan/22-desktop-studio.md`, Where it is kept).
 */
export const sessionHistorySchema = z.object({
  schemaVersion: z.literal(SESSION_SCHEMA_VERSION),
  id: z.string().min(1).max(80),
  kind: z.enum(['new', 'edit']),
  courseId: z.string().min(1).max(80).nullable(),
  title: z.string().min(1).max(160),
  summary: z.string().max(4_000),
  status: z.enum(['saved', 'discarded']),
  turns: z.number().int().min(0),
  changes: z.number().int().min(0),
  goals: z.number().int().min(0),
  goalsDone: z.number().int().min(0),
  todosLeft: z.number().int().min(0),
  createdAt: at,
  closedAt: at,
  /** Claude Code's session id while its own copy of the chat is still to be deleted, else null. */
  forgetPending: z.string().min(1).max(200).nullable(),
});
export type SessionHistory = z.infer<typeof sessionHistorySchema>;

const unreadableSchema = z.object({ since: at });

/** `editing.json`: when the hand edits began, and the working copy before them. */
export const handEditsSchema = z.object({ since: at, before: workingSchema });
export type PendingHandEdits = z.infer<typeof handEditsSchema>;

/** The stored draft a session compares with: its `rev`, when it was saved, and its copy. */
export type SessionBase = z.infer<typeof sessionBaseSchema>;

/** `agent-note.json`: turns undone, and whether the course was edited by hand, since the last message. */
export const agentNoteSchema = z.object({
  undone: z.number().int().min(0).max(10_000),
  handEdited: z.boolean(),
});
export type AgentNote = z.infer<typeof agentNoteSchema>;

/** `creating.json`: the address and title of the latest attempt, and when the first at it began. */
export const creatingSchema = z.object({
  slug,
  title: courseSchema.shape.title,
  since: at,
});
export type CreatingNote = z.infer<typeof creatingSchema>;

/** One second opinion: the options it chose (places from 0) and why, for one question's hash. */
export const answerResultSchema = z.object({
  hash: z.string().regex(/^[0-9a-f]{16}$/),
  picked: z.array(z.number().int().min(0).max(7)).max(8),
  reason: z.string().max(300),
  at,
});
export type AnswerResult = z.infer<typeof answerResultSchema>;

/** `answer-check.json`. */
export const answerCheckSchema = z.object({
  schemaVersion: z.literal(1),
  skipped: z.boolean(),
  results: z.array(answerResultSchema).max(ANSWER_RESULTS_KEPT),
});
export type AnswerCheckFile = z.infer<typeof answerCheckSchema>;

/**
 * Was this file written by a newer app (a `schemaVersion` above this one's)? Only the log says so:
 * this app cannot read it either way, and sweeps it as it sweeps any unreadable folder.
 */
function isNewer(data: unknown): boolean {
  const version = (data as { schemaVersion?: unknown } | null)?.schemaVersion;
  return typeof version === 'number' && version > SESSION_SCHEMA_VERSION;
}

/**
 * What a session is started from: a goal, and for an edit session the course. `id` is the new
 * session's id when the start dialog already made one, because the Sources folder is chosen for it
 * (`sources.choose` names a session) before the session exists; otherwise one is made here.
 */
export type StartRequest = (
  | { kind: 'new'; goal: string; educatorName?: string | undefined }
  | { kind: 'edit'; courseId: string; goal: string }
) & { id?: string | undefined };

export type StartResult =
  /** Created and written; open it. */
  | { status: 'started'; session: AuthoringSession }
  /** This person already has an open session on that course: offer to open it instead. */
  | { status: 'already_open'; session: AuthoringSession }
  /** The course has no draft this person can read. Nothing was written. */
  | { status: 'no_draft' };

export interface SessionList {
  /** Every readable session, open or closed, newest change first. */
  sessions: AuthoringSession[];
  /** Sessions whose files were removed, newest closed first. */
  history: SessionHistory[];
}

export interface SessionStore {
  /** The session, or null when it is not on this computer or its file cannot be read. */
  read(sessionId: string): Promise<AuthoringSession | null>;
  /** Writes the session as it is, with `updatedAt` set to now; answers what was written. */
  save(session: AuthoringSession): Promise<AuthoringSession>;
  /**
   * After every turn: the working copy as the turn left it goes to `checkpoints/{turn.checkpoint}`,
   * then the session with the turn added, then checkpoints older than the newest 30 are removed.
   * The workspace (`DSK-13`) calls it at each turn's end, so a restart loses nothing.
   */
  saveTurn(session: AuthoringSession, turn: Turn, work: WorkingCopy): Promise<AuthoringSession>;
  /** A turn's checkpoint, or null when it was removed or cannot be read. */
  readCheckpoint(sessionId: string, file: string): Promise<WorkingCopy | null>;
  /** Writes `checkpoints/start.json`: the working copy before the first turn, for Undo. */
  saveStart(sessionId: string, work: WorkingCopy): Promise<void>;
  /**
   * Writes the base from before a turn that moves it (Bring in their changes) to
   * `checkpoints/{file}`, the turn's `baseBefore`, for Undo. Kept as long as the turn's checkpoint.
   */
  saveBaseBefore(sessionId: string, file: string, base: SessionBase): Promise<void>;
  /** The base a turn moved from (`baseBefore`), or null when it was removed or cannot be read. */
  readBaseBefore(sessionId: string, file: string): Promise<SessionBase | null>;
  /**
   * Undo of the newest turn: the session without that turn and with `work` (the checkpoint before
   * it) as its working copy, and `base` as its base when the turn had moved it; then the undone
   * turn's checkpoint (and the base it kept) removed. Answers what was written.
   */
  undoTurn(
    session: AuthoringSession,
    work: WorkingCopy,
    base?: SessionBase,
  ): Promise<AuthoringSession>;
  /** Notes that hand edits began (`EDITING_FILE`), with the working copy from before them. */
  saveHandEdits(sessionId: string, pending: PendingHandEdits): Promise<void>;
  /** The hand edits not yet a turn, or null when there are none or the file cannot be read. */
  readHandEdits(sessionId: string): Promise<PendingHandEdits | null>;
  /** Forgets the note once the hand edits are a turn (or came to nothing). */
  clearHandEdits(sessionId: string): Promise<void>;
  /** Writes what the agent is to be told with the next message (`AGENT_NOTE_FILE`); null removes it. */
  saveAgentNote(sessionId: string, note: AgentNote | null): Promise<void>;
  /** What the agent is still to be told, or null when nothing (or the file cannot be read). */
  readAgentNote(sessionId: string): Promise<AgentNote | null>;
  /** Writes the draft of the course created for a new-course session (`CREATED_FILE`). */
  saveCreated(sessionId: string, base: SessionBase): Promise<void>;
  /** The course created for a new-course session, or null when none (or it cannot be read). */
  readCreated(sessionId: string): Promise<SessionBase | null>;
  /** Notes an attempt to create a new-course session's course (`CREATING_FILE`). */
  saveCreating(sessionId: string, note: CreatingNote): Promise<void>;
  /** The last attempt to create the course, or null when none (or it cannot be read). */
  readCreating(sessionId: string): Promise<CreatingNote | null>;
  /** Writes the answer check's second opinions and its skip (`ANSWER_CHECK_FILE`). */
  saveAnswerCheck(sessionId: string, check: AnswerCheckFile): Promise<void>;
  /** The answer check as last written, or null when there is none (or it cannot be read). */
  readAnswerCheck(sessionId: string): Promise<AnswerCheckFile | null>;
  /** The chat, oldest first; empty when there is none yet. Damaged lines are left out. */
  readTranscript(sessionId: string): Promise<TranscriptEntry[]>;
  /** Replaces the chat file (the newest entries, when it would be too large). */
  writeTranscript(sessionId: string, entries: readonly TranscriptEntry[]): Promise<void>;
  /** Marks the session saved or discarded; its files go 30 days later (`sweep`). */
  close(session: AuthoringSession, status: 'saved' | 'discarded'): Promise<AuthoringSession>;
  /** Every session this person has on this computer, and the history of removed ones. */
  list(): Promise<SessionList>;
  /** The person's open session on this course, if any: one per course per person. */
  openFor(courseId: string): Promise<AuthoringSession | null>;
  /**
   * Starts a session. An edit session reads the draft once (`getDraft`) and keeps it as its base;
   * a new-course session starts from a blank course and no base. Firestore is never written.
   */
  start(
    request: StartRequest,
    getDraft: (courseId: string) => Promise<DraftDoc | null>,
  ): Promise<StartResult>;
  /**
   * Removes the files of every session saved or discarded 30 days ago or more, keeping its title,
   * summary and counts as history, and asks the agent bridge to forget Claude Code's own copy of
   * its chat. A forget that fails is tried again on the next sweep. Answers how many were removed.
   */
  sweep(): Promise<number>;
}

export interface SessionStoreOptions {
  /** The bridge's `store` and `agent.forget`, from `desktop/bridge.ts`. */
  desktop: { store: GurukulDesktop['store']; agent: Pick<GurukulDesktop['agent'], 'forget'> };
  uid: string;
  now?: () => Date;
  /** A new session id: a safe folder name. */
  newId?: () => string;
}

/** A title from the goal: its first sentence, cut on a word to fit a top bar. */
export function titleFromGoal(goal: string): string {
  const flat = goal.replace(/\s+/g, ' ').trim();
  const sentence = /^(.+?[.!?])(?:\s|$)/.exec(flat)?.[1] ?? flat;
  if (sentence.length <= TITLE_LENGTH) return sentence;
  const cut = sentence.slice(0, TITLE_LENGTH - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > TITLE_LENGTH / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** What a closed session leaves behind once its files are removed. */
export function historyOf(session: AuthoringSession, closedAt: string): SessionHistory {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: session.id,
    kind: session.kind,
    courseId: session.courseId,
    title: session.title,
    summary: session.summary,
    // `close` never writes `open`; a session is only retired once closed.
    status: session.status === 'discarded' ? 'discarded' : 'saved',
    turns: session.turns.length,
    changes: session.turns.reduce((sum, t) => sum + t.changes, 0),
    goals: session.goals.length,
    goalsDone: session.goals.filter((g) => g.done).length,
    todosLeft: session.todos.filter((t) => !t.done).length,
    createdAt: session.createdAt,
    closedAt,
    forgetPending: session.agentSessionId,
  };
}

/** Is a closed session's 30 days up? Closing is its last change, so `updatedAt` is when it closed. */
export function isDue(session: AuthoringSession, now: Date): boolean {
  return (
    session.status !== 'open' &&
    now.getTime() - Date.parse(session.updatedAt) >= SESSION_FILES_DAYS * DAY_MS
  );
}

/**
 * A course's `publishedAt` as a session file keeps it. `JSON.stringify` writes Firestore's
 * `Timestamp` as its seconds and nanoseconds; read back, they become this, which the course schema
 * takes as a timestamp, so a session on a published course opens again (found by `DSK-24`: it was
 * written, then "not on this computer"). Its own fields are the `Timestamp`'s, so it is written and
 * compared as one. Firestore is never handed it: Save writes the stored draft's own `publishedAt`
 * (`StudioData.saveDraft`).
 */
export class StoredTimestamp implements TimestampLike {
  constructor(
    readonly seconds: number,
    readonly nanoseconds: number,
  ) {}
  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }
  toDate(): Date {
    return new Date(this.toMillis());
  }
}

/** `JSON.parse`'s reviver for session files: a `publishedAt` of seconds and nanoseconds. */
function reviveTimestamp(key: string, value: unknown): unknown {
  if (key !== 'publishedAt' || value === null || typeof value !== 'object') return value;
  const { seconds, nanoseconds } = value as { seconds?: unknown; nanoseconds?: unknown };
  return typeof seconds === 'number' && typeof nanoseconds === 'number'
    ? new StoredTimestamp(seconds, nanoseconds)
    : value;
}

function parse<T>(
  text: string | null,
  schema: z.ZodType<T>,
  fields: Record<string, unknown>,
): T | null {
  if (text === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(text, reviveTimestamp);
  } catch {
    log.warn('Session file unreadable', { ...fields, reason: 'json' });
    return null;
  }
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  log.warn('Session file unreadable', { ...fields, reason: isNewer(data) ? 'newer' : 'schema' });
  return null;
}

export function createSessionStore({
  desktop,
  uid,
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
}: SessionStoreOptions): SessionStore {
  const { store, agent } = desktop;
  const file = (sessionId: string, path: string) => ({ uid, sessionId, path });

  const write = async (session: AuthoringSession) => {
    // A bug that builds an invalid session throws here, before anything reaches the disk.
    const valid = authoringSessionSchema.parse(session);
    await store.write(file(valid.id, SESSION_FILE), JSON.stringify(valid));
    return valid;
  };

  const parseSession = (sessionId: string, text: string | null) =>
    parse(text, authoringSessionSchema, { sessionId, file: 'session' });

  const read: SessionStore['read'] = async (sessionId) =>
    parseSession(sessionId, await store.read(file(sessionId, SESSION_FILE)));

  const readHistory = async (sessionId: string) =>
    parse(await store.read(file(sessionId, HISTORY_FILE)), sessionHistorySchema, {
      sessionId,
      file: 'history',
    });

  const save: SessionStore['save'] = (session) =>
    write({ ...session, updatedAt: now().toISOString() });

  const list: SessionStore['list'] = async () => {
    const ids = await store.list({ uid });
    const sessions: AuthoringSession[] = [];
    const history: SessionHistory[] = [];
    for (const id of ids) {
      const session = await read(id);
      if (session) sessions.push(session);
      else {
        const past = await readHistory(id);
        if (past) history.push(past);
      }
    }
    sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    history.sort((a, b) => b.closedAt.localeCompare(a.closedAt));
    return { sessions, history };
  };

  const openFor: SessionStore['openFor'] = async (courseId) =>
    (await list()).sessions.find((s) => s.status === 'open' && s.courseId === courseId) ?? null;

  /** Asks the shell to delete Claude Code's copy of the chat; a failure waits for the next sweep. */
  const forget = async (history: SessionHistory) => {
    if (history.forgetPending === null) return;
    try {
      await agent.forget(history.forgetPending);
    } catch (error) {
      log.warn('Session transcript not forgotten', {
        sessionId: history.id,
        reason: bridgeFailure(error),
      });
      return;
    }
    await store.write(
      file(history.id, HISTORY_FILE),
      JSON.stringify({ ...history, forgetPending: null }),
    );
  };

  /**
   * History first, then every other file, `session.json` last: a crash midway is retried whole. The
   * agent bridge's own files (`prompt.md`, `skills/`, `mcp.json`, `workdir/`) cannot be removed one
   * by one, so a session that reached Claude Code then loses its whole folder and gets its history
   * written again; a crash between those two loses only the history line.
   */
  const retire = async (session: AuthoringSession) => {
    const history = historyOf(session, session.updatedAt);
    await store.write(file(session.id, HISTORY_FILE), JSON.stringify(history));
    const files = await store.list({ uid, sessionId: session.id });
    const others = files.filter(
      (f) => f !== HISTORY_FILE && f !== SESSION_FILE && !isAgentSessionFile(f),
    );
    await Promise.all(others.map((path) => store.remove({ uid, sessionId: session.id, path })));
    await store.remove({ uid, sessionId: session.id, path: SESSION_FILE });
    if (files.some(isAgentSessionFile)) {
      await store.remove({ uid, sessionId: session.id });
      await store.write(file(session.id, HISTORY_FILE), JSON.stringify(history));
    }
    await forget(history);
  };

  /**
   * A folder this app cannot read: the first sweep notes the day in `unreadable.json`, and the
   * sweep 30 days later removes the whole folder, so no answer keys outlive the 30 days the plan
   * allows. Nothing in it can be shown as history: its title is in the file that cannot be read.
   * Answers whether it was removed.
   */
  const retireUnreadable = async (sessionId: string, moment: Date) => {
    const since = parse(await store.read(file(sessionId, UNREADABLE_FILE)), unreadableSchema, {
      sessionId,
      file: 'unreadable',
    })?.since;
    if (since === undefined) {
      await store.write(
        file(sessionId, UNREADABLE_FILE),
        JSON.stringify({ since: moment.toISOString() }),
      );
      log.warn('Session folder unreadable', { sessionId, removeInDays: SESSION_FILES_DAYS });
      return false;
    }
    if (moment.getTime() - Date.parse(since) < SESSION_FILES_DAYS * DAY_MS) return false;
    await store.remove({ uid, sessionId });
    log.warn('Unreadable session folder removed', { sessionId });
    return true;
  };

  return {
    read,
    save,
    list,
    openFor,

    async saveTurn(session, turn, work) {
      const valid = workingSchema.parse(work);
      await store.write(file(session.id, checkpointPath(turn.checkpoint)), JSON.stringify(valid));
      const next = await save({ ...session, work: valid, turns: [...session.turns, turn] });
      const kept = new Set([
        checkpointPath(START_CHECKPOINT),
        ...next.turns
          .slice(-SESSION_CHECKPOINTS_KEPT)
          .flatMap((t) => (t.baseBefore ? [t.checkpoint, t.baseBefore] : [t.checkpoint]))
          .map(checkpointPath),
      ]);
      const stale = (await store.list({ uid, sessionId: session.id })).filter(
        (f) => f.startsWith(checkpointPath('')) && !kept.has(f),
      );
      await Promise.all(stale.map((path) => store.remove({ uid, sessionId: session.id, path })));
      return next;
    },

    async readCheckpoint(sessionId, name) {
      return parse(await store.read(file(sessionId, checkpointPath(name))), workingSchema, {
        sessionId,
        file: 'checkpoint',
      });
    },

    async saveStart(sessionId, work) {
      const valid = workingSchema.parse(work);
      await store.write(file(sessionId, checkpointPath(START_CHECKPOINT)), JSON.stringify(valid));
    },

    async saveBaseBefore(sessionId, name, base) {
      const valid = sessionBaseSchema.parse(base);
      await store.write(file(sessionId, checkpointPath(name)), JSON.stringify(valid));
    },

    async readBaseBefore(sessionId, name) {
      return parse(await store.read(file(sessionId, checkpointPath(name))), sessionBaseSchema, {
        sessionId,
        file: 'base',
      });
    },

    async undoTurn(session, work, base) {
      const undone = session.turns.at(-1);
      const next = await save({
        ...session,
        ...(base ? { base: sessionBaseSchema.parse(base) } : {}),
        work: workingSchema.parse(work),
        turns: session.turns.slice(0, -1),
      });
      if (undone) {
        await store.remove(file(session.id, checkpointPath(undone.checkpoint)));
        if (undone.baseBefore)
          await store.remove(file(session.id, checkpointPath(undone.baseBefore)));
      }
      return next;
    },

    async saveHandEdits(sessionId, pending) {
      const valid = handEditsSchema.parse(pending);
      await store.write(file(sessionId, EDITING_FILE), JSON.stringify(valid));
    },

    async readHandEdits(sessionId) {
      return parse(await store.read(file(sessionId, EDITING_FILE)), handEditsSchema, {
        sessionId,
        file: 'editing',
      });
    },

    async clearHandEdits(sessionId) {
      await store.remove(file(sessionId, EDITING_FILE));
    },

    async saveAgentNote(sessionId, note) {
      if (note === null) return store.remove(file(sessionId, AGENT_NOTE_FILE));
      await store.write(
        file(sessionId, AGENT_NOTE_FILE),
        JSON.stringify(agentNoteSchema.parse(note)),
      );
    },

    async readAgentNote(sessionId) {
      return parse(await store.read(file(sessionId, AGENT_NOTE_FILE)), agentNoteSchema, {
        sessionId,
        file: 'agent-note',
      });
    },

    async saveCreated(sessionId, base) {
      const valid = sessionBaseSchema.parse(base);
      await store.write(file(sessionId, CREATED_FILE), JSON.stringify(valid));
    },

    async readCreated(sessionId) {
      return parse(await store.read(file(sessionId, CREATED_FILE)), sessionBaseSchema, {
        sessionId,
        file: 'created',
      });
    },

    async saveCreating(sessionId, note) {
      const valid = creatingSchema.parse(note);
      await store.write(file(sessionId, CREATING_FILE), JSON.stringify(valid));
    },

    async readCreating(sessionId) {
      return parse(await store.read(file(sessionId, CREATING_FILE)), creatingSchema, {
        sessionId,
        file: 'creating',
      });
    },

    async saveAnswerCheck(sessionId, check) {
      await store.write(
        file(sessionId, ANSWER_CHECK_FILE),
        JSON.stringify(answerCheckSchema.parse(check)),
      );
    },

    async readAnswerCheck(sessionId) {
      return parse(await store.read(file(sessionId, ANSWER_CHECK_FILE)), answerCheckSchema, {
        sessionId,
        file: 'answer-check',
      });
    },

    async readTranscript(sessionId) {
      const text = await store.read(file(sessionId, TRANSCRIPT_FILE));
      if (text === null) return [];
      const { entries, dropped } = parseTranscript(text);
      if (dropped > 0)
        log.warn('Session transcript lines unreadable', { sessionId, count: dropped });
      return entries;
    },

    async writeTranscript(sessionId, entries) {
      await store.write(file(sessionId, TRANSCRIPT_FILE), transcriptText(entries));
    },

    async close(session, status) {
      const closed = await save({ ...session, status });
      log.info('Session closed', { sessionId: session.id, status });
      return closed;
    },

    async start(request, getDraft) {
      if (request.kind === 'edit') {
        const open = await openFor(request.courseId);
        if (open) return { status: 'already_open', session: open };
      }
      const id = request.id ?? newId();
      const createdAt = now().toISOString();
      const goal = request.goal.trim().slice(0, GOAL_MAX_LENGTH);
      let base: AuthoringSession['base'] = null;
      let work: WorkingCopy;
      if (request.kind === 'edit') {
        // The one Firestore read a session costs.
        const draft = await getDraft(request.courseId);
        if (!draft) return { status: 'no_draft' };
        work = {
          course: draft.course,
          answers: draft.answers,
          ...(draft.answersChanged ? { answersChanged: true as const } : {}),
        };
        base = { rev: draft.rev, savedAt: draft.updatedAt?.toISOString() ?? null, work };
      } else {
        work = {
          course: blankCourse({
            id: NEW_COURSE_ID,
            title: NEW_COURSE_TITLE,
            level: 'foundation',
            theme: 'forest',
            educatorId: uid,
            educatorName: request.educatorName,
          }),
          answers: {},
        };
      }
      const session = await write({
        schemaVersion: SESSION_SCHEMA_VERSION,
        id,
        uid,
        kind: request.kind,
        courseId: request.kind === 'edit' ? request.courseId : null,
        title: titleFromGoal(goal),
        goals: [{ text: goal, done: false }],
        summary: '',
        status: 'open',
        base,
        work,
        turns: [],
        todos: [],
        viewed: [],
        agentSessionId: null,
        createdAt,
        updatedAt: createdAt,
      });
      log.info('Session started', {
        sessionId: id,
        kind: request.kind,
        courseId: session.courseId,
      });
      return { status: 'started', session };
    },

    async sweep() {
      const moment = now();
      let removed = 0;
      for (const id of await store.list({ uid })) {
        try {
          const text = await store.read(file(id, SESSION_FILE));
          const session = parseSession(id, text);
          if (session) {
            if (!isDue(session, moment)) continue;
            await retire(session);
            removed += 1;
            continue;
          }
          const past = await readHistory(id);
          if (past) await forget(past);
          // A retired session: its history is all that is left.
          if (past && text === null) continue;
          if (await retireUnreadable(id, moment)) removed += 1;
        } catch (error) {
          log.error('Session clean-up failed', error, { sessionId: id });
        }
      }
      if (removed > 0) log.info('Session files removed', { count: removed });
      return removed;
    },
  };
}
