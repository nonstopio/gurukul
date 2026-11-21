import { z } from 'zod';
import { courseSchema, slug } from './course';
import { answerKeysSchema } from './draft';

/** Version of the `session.json` shape; goes up when a field changes meaning, so the app can migrate. */
export const SESSION_SCHEMA_VERSION = 1;

/** The models and effort levels a session may pick; the desktop shell's lists, held equal by a test. */
export const SESSION_MODELS = ['opus', 'sonnet', 'haiku'] as const;
export const SESSION_EFFORTS = ['low', 'medium', 'high'] as const;

/** How many checkpoints a session keeps on disk: the newest 30, older ones are deleted. */
export const SESSION_CHECKPOINTS_KEPT = 30;

/** Days after a session is saved or discarded before its files (which hold answer keys) are removed. */
export const SESSION_FILES_DAYS = 30;

const id = z.string().min(1).max(80);

/** A moment as an ISO-8601 string: sessions are local files, not Firestore documents. */
const at = z.iso.datetime({ offset: true });

/**
 * The working copy an editor changes: a course and its answer keys. Same shape as the Studio's own
 * `Working` type, so one can be handed to the other without conversion.
 */
export const workingSchema = z.object({
  course: courseSchema,
  answers: answerKeysSchema,
  /** Set once an answer key differs from the stored draft's, as in `draftSchema`. */
  answersChanged: z.literal(true).optional(),
});
export type WorkingCopy = z.infer<typeof workingSchema>;

/** A file name inside the session's `checkpoints/` folder; never a path. */
const checkpointFile = z
  .string()
  .max(200)
  .regex(/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/, 'a plain file name, without folders');

/** The stored draft a session compares with: its `rev`, when it was saved, and its copy. */
export const sessionBaseSchema = z.object({
  rev: z.number().int().min(0),
  savedAt: at.nullable(),
  work: workingSchema,
});

/** Most changed parts a turn names; its `changes` count still says how many there were. */
export const MAX_TURN_PARTS = 100;

/** One changed course part, as the chat names it: its kind, its title then, and what happened. */
export const turnPartSchema = z.object({
  kind: z.enum(['course', 'landing', 'chapter', 'lesson', 'quiz']),
  title: z.string().max(200),
  status: z.enum(['added', 'changed', 'removed', 'moved', 'renamed']),
});
export type TurnPart = z.infer<typeof turnPartSchema>;

/** One step of a session: who made it, what it did in a line, and the checkpoint file to go back to. */
export const turnSchema = z.object({
  id,
  at,
  by: z.enum(['agent', 'educator']),
  /** One line, for the timeline. */
  summary: z.string().max(300),
  /** File name inside the session's `checkpoints/` folder, e.g. `<turnId>.json`. */
  checkpoint: checkpointFile,
  /** How many Review rows (`courseChanges` against the turn before) this turn changed: "Turn 4 · 4 changes". */
  changes: z.number().int().min(0),
  /**
   * Only on a turn that moved the base (Bring in their changes): the file in `checkpoints/` that
   * holds the base from before it (`sessionBaseSchema`), which Undo of this turn puts back.
   */
  baseBefore: checkpointFile.optional(),
  /**
   * What the turn changed, named for the chat's list (`turnParts`): one entry per changed course
   * part, the first 100 only. Absent on turns written before it existed; the count is still right.
   */
  parts: z.array(turnPartSchema).max(MAX_TURN_PARTS).optional(),
});
export type Turn = z.infer<typeof turnSchema>;

/** Something the agent left for the Educator to do, optionally pointing at a lesson or block. */
export const todoSchema = z.object({
  id,
  text: z.string().min(1).max(300),
  itemId: id.optional(),
  blockId: id.optional(),
  done: z.boolean(),
  createdAt: at,
});
export type SessionTodo = z.infer<typeof todoSchema>;

/** One thing the Educator asked for, and whether the work has met it; Review ticks these. */
export const goalSchema = z.object({
  text: z.string().min(1).max(300),
  done: z.boolean(),
});
export type SessionGoal = z.infer<typeof goalSchema>;

const duplicate = (ids: string[]) => ids.find((x, i) => ids.indexOf(x) !== i);

/**
 * `sessions/{uid}/{sessionId}/session.json` on an Educator's laptop: one Desktop Studio authoring
 * session. It never reaches Firestore; Save to draft is what writes the course.
 */
export const authoringSessionSchema = z
  .object({
    schemaVersion: z.literal(SESSION_SCHEMA_VERSION),
    id: id,
    uid: z.string().min(1).max(128),
    kind: z.enum(['new', 'edit']),
    /** Null until a new course gets its slug at the first save. */
    courseId: slug.nullable(),
    title: z.string().min(1).max(160),
    goals: z.array(goalSchema).max(20),
    /** What the session did, written by the agent and editable in Review. */
    summary: z.string().max(4_000),
    status: z.enum(['open', 'saved', 'discarded']),
    /** The stored draft the session started from or last saved to; null for a new course. */
    base: sessionBaseSchema.nullable(),
    /** The course and answer keys as changed so far. */
    work: workingSchema,
    turns: z.array(turnSchema).max(10_000),
    todos: z.array(todoSchema).max(100),
    /** Keys of the Review rows the Educator ticked as viewed (`ChangeRow.key`, e.g. `lesson:l2`). */
    viewed: z.array(id).max(10_000),
    /** The Claude Code session to resume; null before the first turn. */
    agentSessionId: z.string().min(1).max(200).nullable(),
    /**
     * What the Educator picked in the chat's bar; absent is Claude Code's default. Optional, so a
     * session written before they existed reads as it is (no schema version bump).
     */
    model: z.enum(SESSION_MODELS).optional(),
    effort: z.enum(SESSION_EFFORTS).optional(),
    createdAt: at,
    updatedAt: at,
  })
  .superRefine((s, ctx) => {
    const fail = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: 'custom', message, path });
    if (s.kind === 'edit' && s.courseId === null)
      fail('An edit session belongs to a course.', ['courseId']);
    if (s.kind === 'edit' && s.base === null)
      fail('An edit session starts from a stored draft.', ['base']);
    if (s.base !== null && s.courseId === null)
      fail('A base is the stored draft of a known course.', ['courseId']);
    if (s.kind === 'new' && s.courseId !== null && s.base === null)
      fail('A new course gains its course and its base together, at its first save.', ['base']);
    if (s.base !== null && s.courseId !== null && s.base.work.course.id !== s.courseId)
      fail('The base is a draft of another course.', ['base', 'work', 'course', 'id']);
    if (s.courseId !== null && s.work.course.id !== s.courseId)
      fail('The working course is not the course of this session.', ['work', 'course', 'id']);
    const turn = duplicate(s.turns.map((t) => t.id));
    if (turn !== undefined) fail(`The turn id "${turn}" is used twice.`, ['turns']);
    const todo = duplicate(s.todos.map((t) => t.id));
    if (todo !== undefined) fail(`The todo id "${todo}" is used twice.`, ['todos']);
  });
export type AuthoringSession = z.infer<typeof authoringSessionSchema>;
