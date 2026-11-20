import {
  COURSE_BYTES_LIMIT,
  COURSE_BYTES_WARN,
  courseBytes,
  validateForPublish,
  workingSchema,
} from '@gurukul/schema';
import type { Chapter, Course, Item, PublishIssue, SessionTodo, Turn } from '@gurukul/schema';
import type {
  AnswerChange,
  ChangeRow,
  CourseChanges,
  FieldChange,
  FieldValue,
  ListEntryChange,
} from '@gurukul/schema/changes';
import { lintCourse } from '@gurukul/schema/writingLint';
import type { WritingFinding } from '@gurukul/schema/writingLint';
import type { Working } from '../types';
import {
  COURSE_TARGET,
  LANDING_TARGET,
  MAX_ATTACHMENTS,
  attachmentKey,
  chapterTarget,
  itemTarget,
} from './attachments';
import type { AttachTarget, AttachWords } from './attachments';
import { START_CHECKPOINT } from './store';

/*
 * What Review draws, worked out without React (`.plan/22-desktop-studio.md`, Review: the whole
 * session at once): the change list grouped by chapter, each row's name and number, settings as
 * words ("Pass mark 70% → 80%"), a changed correct answer in letters, and the checks. Everything
 * reads `courseChanges`, so Review, the header count and the outline never disagree.
 */

// ─── Rows ────────────────────────────────────────────────────────────────────────────────────────

/** Where an item or chapter of the working copy is, numbered like the outline: "3", "3.2". */
export interface Numbers {
  chapters: ReadonlyMap<string, string>;
  /** By `<type>:<id>`, the first of a repeated id. */
  items: ReadonlyMap<string, string>;
}

export function numbersOf(course: Course): Numbers {
  const chapters = new Map<string, string>();
  const items = new Map<string, string>();
  course.chapters.forEach((chapter, c) => {
    if (!chapters.has(chapter.id)) chapters.set(chapter.id, String(c + 1));
    chapter.items.forEach((item, i) => {
      const key = `${item.type}:${item.id}`;
      if (!items.has(key)) items.set(key, `${c + 1}.${i + 1}`);
    });
  });
  return { chapters, items };
}

/** The words for a row's own thing, before or after (a removed one has only before). */
type Titled = { title: string } | null;
const titleOf = (row: { before: Titled; after: Titled }) =>
  (row.after ?? row.before)?.title.trim() || 'Untitled';

/** What the list and the detail call a row: "Course details", "3 · Rebase", "3.2 · Why rebase". */
export function rowName(row: ChangeRow, numbers: Numbers): string {
  switch (row.kind) {
    case 'course':
      return 'Course details';
    case 'landing':
      return 'Landing page';
    case 'chapter': {
      const number = row.after ? numbers.chapters.get(row.id) : undefined;
      return number ? `${number} · ${titleOf(row)}` : titleOf(row);
    }
    default: {
      const number = row.after ? numbers.items.get(`${row.kind}:${row.id}`) : undefined;
      return number ? `${number} · ${titleOf(row)}` : titleOf(row);
    }
  }
}

/** A heading of the change list: a chapter, with the rows of its lessons and Quizzes. */
export interface ReviewGroup {
  /** `top` for course details and the landing page; else the chapter's id. */
  key: string;
  /** The chapter as named in the list; null for `top`. */
  title: string | null;
  /** The chapter's own row, when it changed. */
  row: ChangeRow | null;
  rows: ChangeRow[];
}

/**
 * The rows under their chapter, in course order: course details and the landing page first, then
 * each chapter that has a row of its own or of a lesson or Quiz in it. A chapter that did not
 * change itself is named from the working copy, or the base when it is gone.
 */
export function groupRows(
  rows: readonly ChangeRow[],
  work: Course,
  base: Course | null,
  numbers: Numbers,
): ReviewGroup[] {
  const groups: ReviewGroup[] = [];
  const top: ReviewGroup = { key: 'top', title: null, row: null, rows: [] };
  const chapterName = (id: string) => {
    const now = work.chapters.find((c) => c.id === id);
    const was = base?.chapters.find((c) => c.id === id) as Chapter;
    const number = now ? numbers.chapters.get(id) : undefined;
    const title = (now ?? was).title.trim() || 'Untitled';
    return number ? `${number} · ${title}` : title;
  };
  let current = null as ReviewGroup | null;
  for (const row of rows) {
    if (row.kind === 'course' || row.kind === 'landing') {
      top.rows.push(row);
      continue;
    }
    const chapterId = row.kind === 'chapter' ? row.id : row.chapterId;
    // A chapter's own row comes before its items, so a new group starts there.
    if (row.kind === 'chapter' || current?.key !== chapterId) {
      current = { key: chapterId, title: chapterName(chapterId), row: null, rows: [] };
      groups.push(current);
    }
    if (row.kind === 'chapter') current.row = row;
    else current.rows.push(row);
  }
  return top.rows.length > 0 ? [top, ...groups] : groups;
}

/** The part of the course a row attaches to the next message; null for something removed. */
export function rowTarget(
  row: ChangeRow,
  words: AttachWords,
  numbers: Numbers,
): AttachTarget | null {
  switch (row.kind) {
    case 'course':
      return COURSE_TARGET;
    case 'landing':
      return LANDING_TARGET;
    case 'chapter': {
      const number = numbers.chapters.get(row.id);
      return row.after && number
        ? chapterTarget(words, { id: row.id, title: row.after.title }, number)
        : null;
    }
    default: {
      const number = numbers.items.get(`${row.kind}:${row.id}`);
      return row.after && number
        ? itemTarget(words, { id: row.id, type: row.kind, title: row.after.title }, number)
        : null;
    }
  }
}

/** The rows one turn changed: its checkpoint against the one before (`start.json` for the first). */
export function turnFiles(turns: readonly Turn[], turnId: string): [string, string] | null {
  const at = turns.findIndex((t) => t.id === turnId);
  if (at < 0) return null;
  const before = at === 0 ? START_CHECKPOINT : (turns[at - 1] as Turn).checkpoint;
  return [before, (turns[at] as Turn).checkpoint];
}

/** "11 changes · 7 viewed". */
export function countLine(rows: readonly ChangeRow[], viewed: ReadonlySet<string>): string {
  const seen = rows.filter((r) => viewed.has(r.key)).length;
  return `${rows.length} ${rows.length === 1 ? 'change' : 'changes'} · ${seen} viewed`;
}

// ─── Fields in words ─────────────────────────────────────────────────────────────────────────────

const FIELD_NAMES: Record<string, string> = {
  title: 'Title',
  summary: 'Summary',
  level: 'Level',
  'cover.theme': 'Cover colour',
  'cover.glyph': 'Cover letters',
  'cover.image': 'Cover image',
  'rules.sequential': 'In order',
  'rules.passMark': 'Pass mark',
  'rules.certificate': 'Certificate',
  'rules.requireVideoWatch': 'Videos must be watched',
  'certificate.title': 'Certificate title',
  description: 'Description',
  minutes: 'Minutes',
  layout: 'Layout',
  completeWhen: 'Complete when',
  kindLabel: 'Label',
  passMark: 'Pass mark',
  questionsShown: 'Shown',
  shuffleOptions: 'Shuffle answers',
  cooldownMinutes: 'Wait before a retry',
  revealAnswers: 'Show answers',
  blocksNext: 'Must pass to go on',
  kind: 'Question type',
  prompt: 'Question',
  code: 'Code',
  explanation: 'Explanation',
  reviewItemId: 'Revisits',
  md: 'Text',
  tone: 'Tone',
  lang: 'Language',
  file: 'File name',
  copy: 'Copy button',
  terminal: 'Terminal',
  highlight: 'Highlighted lines',
  provider: 'Provider',
  url: 'Address',
  captions: 'Captions',
  caption: 'Caption',
  durationSec: 'Length',
  alt: 'Alt text',
  zoom: 'Opens full size',
  border: 'Frame',
  width: 'Width',
  height: 'Height',
  upload: 'Uploaded file',
  label: 'Label',
  type: 'Block type',
  text: 'Text',
};

/** A field's name in words: "Pass mark". */
export const fieldName = (field: string): string => FIELD_NAMES[field] ?? field;

const ENUM_WORDS: Record<string, string> = {
  foundation: 'Foundation',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  stacked: 'Stacked',
  split: 'Split',
  article: 'Article',
  manual: 'When marked done',
  video90: 'After 90% of the video',
  scrolled: 'When scrolled to the end',
  each: 'After each question',
  onPass: 'Once passed',
  never: 'Never',
  single: 'One answer',
  multiple: 'Several answers',
  trueFalse: 'True or false',
  codeOutput: 'Code output',
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
  column: 'Column',
  medium: 'Medium',
  small: 'Small',
  youtube: 'YouTube',
  drive: 'Google Drive',
  loom: 'Loom',
};

const PERCENT_FIELDS = new Set(['passMark', 'rules.passMark']);

/** A value as Review says it: "70%", "Yes", "5 questions", "45 min". Null is left to the caller. */
export function fieldValue(field: string, value: FieldValue): string | null {
  if (value === null) return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (PERCENT_FIELDS.has(field)) return `${Math.round(value * 100)}%`;
    if (field === 'questionsShown') return `${value} ${value === 1 ? 'question' : 'questions'}`;
    if (field === 'minutes' || field === 'cooldownMinutes') return `${value} min`;
    if (field === 'durationSec') return `${value} s`;
    return String(value);
  }
  return ENUM_WORDS[value] ?? value;
}

/** A setting as one line: "Pass mark 70% → 80%". */
export function settingLine(change: FieldChange): string {
  const say = (v: FieldValue) => fieldValue(change.field, v) ?? 'not set';
  return `${fieldName(change.field)} ${say(change.before)} → ${say(change.after)}`;
}

// ─── Answers ─────────────────────────────────────────────────────────────────────────────────────

/** "A", "B"… for an option's place, from 0. */
export const letter = (index: number): string => String.fromCharCode(65 + index);

/** Where each right answer sits on one side, from 0; -1 for one not there. */
export type PlaceOf = (id: string) => number;

/** The letters of the right answers on one side, in order; "none" when there is none. */
function letters(ids: readonly string[], place: PlaceOf) {
  const found = ids
    .map(place)
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  return found.length === 0 ? 'none' : found.map(letter).join(', ');
}

/** "Correct answer changed: B → C" ("A, C → B" for several, "none" when there is none). */
export function answerLine(answer: AnswerChange, before: PlaceOf, after: PlaceOf): string {
  return `Correct answer changed: ${letters(answer.before, before)} → ${letters(answer.after, after)}`;
}

/** A Quiz question's places: its option ids in each side's order. */
export function questionPlaces(
  before: { options: readonly { id: string }[] },
  after: { options: readonly { id: string }[] },
): [PlaceOf, PlaceOf] {
  return [
    (id) => before.options.findIndex((o) => o.id === id),
    (id) => after.options.findIndex((o) => o.id === id),
  ];
}

/**
 * A check block's places: its answer names entries of `options` (`#<index>`, `removed#<index>`),
 * whose text is found in each side's options.
 */
export function checkPlaces(
  options: readonly ListEntryChange[],
  before: { options: readonly string[] },
  after: { options: readonly string[] },
): [PlaceOf, PlaceOf] {
  const text = (id: string, side: 'before' | 'after') =>
    options.find((o) => o.id === id)?.[side] as string | undefined;
  return [
    (id) => before.options.indexOf(text(id, 'before') as string),
    (id) => after.options.indexOf(text(id, 'after') as string),
  ];
}

// ─── Lists in a row ──────────────────────────────────────────────────────────────────────────────

/** A changed entry on its own, or a run of unchanged ones folded together. */
export type Run<T> = { kind: 'changed'; entry: T } | { kind: 'same'; entries: T[] };

/** Entries in order, consecutive unchanged ones as one run ("3 unchanged blocks"). */
export function runsOf<T extends { statuses: readonly string[] }>(entries: readonly T[]): Run<T>[] {
  const out: Run<T>[] = [];
  for (const entry of entries) {
    const last = out[out.length - 1];
    if (entry.statuses.length > 0) out.push({ kind: 'changed', entry });
    else if (last?.kind === 'same') last.entries.push(entry);
    else out.push({ kind: 'same', entries: [entry] });
  }
  return out;
}

// ─── Checks ──────────────────────────────────────────────────────────────────────────────────────

export type CheckState = 'pass' | 'warn' | 'fail' | 'info';

export interface ReviewChecks {
  /** `courseSchema` on the working copy: stops Save. */
  valid: boolean;
  bytes: number;
  /** Size: `warn` from `COURSE_BYTES_WARN`, `fail` (stops Save) over `COURSE_BYTES_LIMIT`. */
  size: 'pass' | 'warn' | 'fail';
  /** `writingLint` on the text that changed and is still there (`onChangedText`). */
  writing: WritingFinding[];
  /** `validateForPublish`; informs only, a draft may be saved unfinished. */
  publish: PublishIssue[];
  /** The to-dos still open. */
  todos: SessionTodo[];
}

/** The ids `lintCourse` takes for these rows: removed things have no text left to lint. */
export function lintScope(rows: readonly ChangeRow[]): string[] {
  return rows.filter((r) => !r.statuses.includes('removed')).map((r) => r.id);
}

/** Whether an entry's own text may be new: added, or changed (not only moved). */
const touched = (entry: { statuses: readonly string[] } | undefined): boolean =>
  entry !== undefined && (entry.statuses.includes('added') || entry.statuses.includes('changed'));

/**
 * Whether a writing finding sits in text this session changed, so Writing never reports notes on
 * text the session did not touch: anywhere in a row that was added; else a field of the course
 * details, the landing page, a chapter, a lesson or a Quiz that changed, an outcome added or
 * reworded, or a block or question added or changed. A changed block or question is checked whole
 * (its prompt, options and explanation are read together, as "the long option is the right one"
 * and "explain why the answer is right" are).
 */
export function onChangedText(finding: WritingFinding, rows: readonly ChangeRow[]): boolean {
  const row = rowFor(rows, finding);
  if (row === null) return false;
  if (row.statuses.includes('added')) return true;
  const fieldChanged = () => row.fields.some((f) => f.field === finding.field);
  switch (row.kind) {
    case 'lesson':
      return finding.blockId === undefined
        ? fieldChanged()
        : touched(row.blocks.find((b) => b.id === finding.blockId));
    case 'quiz':
      return finding.questionId === undefined
        ? fieldChanged()
        : touched(row.questions.find((q) => q.id === finding.questionId));
    case 'landing':
      return finding.field === 'outcome'
        ? touched(row.outcomes.find((o) => o.id === `#${finding.index}`))
        : fieldChanged();
    default:
      return fieldChanged();
  }
}

export function reviewChecks(
  work: Working,
  changes: CourseChanges,
  todos: readonly SessionTodo[],
  publishOptions: Parameters<typeof validateForPublish>[2] = {},
): ReviewChecks {
  const bytes = courseBytes(work.course, work.answers);
  return {
    valid: workingSchema.safeParse(work).success,
    bytes,
    size: bytes > COURSE_BYTES_LIMIT ? 'fail' : bytes >= COURSE_BYTES_WARN ? 'warn' : 'pass',
    writing: lintCourse(work, lintScope(changes.rows)).filter((f) =>
      onChangedText(f, changes.rows),
    ),
    publish: validateForPublish(work.course, work.answers, publishOptions),
    todos: todos.filter((t) => !t.done),
  };
}

/** "212 KB of 900 KB". */
export const sizeLine = (bytes: number): string =>
  `${Math.round(bytes / 1000)} KB of ${Math.round(COURSE_BYTES_LIMIT / 1000)} KB`;

/** The checks that stop Save to draft, by name: what `DSK-15` disables the button for. */
export function saveBlockers(checks: Pick<ReviewChecks, 'valid' | 'size'>): string[] {
  return [
    ...(checks.valid ? [] : ['Course is valid']),
    ...(checks.size === 'fail' ? ['Size'] : []),
  ];
}

/**
 * The row a finding, an issue or a to-do points at, by its ids: the lesson or Quiz, the chapter,
 * the course details or the landing page. Null when no row of the list holds it.
 */
export function rowFor(
  rows: readonly ChangeRow[],
  at: { itemId?: string | undefined; chapterId?: string | undefined; field?: string },
): ChangeRow | null {
  const match = (row: ChangeRow) => {
    if (at.itemId !== undefined)
      return (row.kind === 'lesson' || row.kind === 'quiz') && row.id === at.itemId;
    if (at.chapterId !== undefined) return row.kind === 'chapter' && row.id === at.chapterId;
    if (at.field === undefined) return false;
    if (at.field === 'description' || at.field === 'outcome') return row.kind === 'landing';
    return row.kind === 'course';
  };
  return rows.find((row) => !row.statuses.includes('removed') && match(row)) ?? null;
}

/** Where a Ready to publish issue points, for `rowFor`. */
export type IssueAt = { itemId?: string; chapterId?: string; field?: string };

/**
 * The row of the change list a Ready to publish issue belongs to, by its code: a lesson or Quiz by
 * its id; a chapter's title by the chapter; the description and outcomes on the landing page; the
 * title, summary, cover, rules and certificate in the course details. Nothing for an issue about
 * the whole course (`course.empty`), or a code this list does not know.
 */
export function issueAt(issue: PublishIssue): IssueAt {
  if (issue.itemId !== undefined) return { itemId: issue.itemId };
  if (issue.chapterId !== undefined) return { chapterId: issue.chapterId };
  const [area, part] = issue.code.split('.');
  if (area === 'course' && (part === 'description' || part === 'outcome' || part === 'outcomes'))
    return { field: 'description' };
  if (area === 'course' && (part === 'title' || part === 'summary' || part === 'cover'))
    return { field: 'title' };
  if (area === 'rules' || area === 'certificate') return { field: 'title' };
  return {};
}

/**
 * The parts to attach when the agent is asked to fix what a check found: each row a finding sits
 * in, once, in list order, at most `MAX_ATTACHMENTS`.
 */
export function fixTargets(
  rows: readonly (ChangeRow | null)[],
  words: AttachWords,
  numbers: Numbers,
): AttachTarget[] {
  const out: AttachTarget[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const target = row ? rowTarget(row, words, numbers) : null;
    if (!target || seen.has(attachmentKey(target))) continue;
    seen.add(attachmentKey(target));
    out.push(target);
  }
  return out.slice(0, MAX_ATTACHMENTS);
}

/** What the agent is asked when the Writing check's findings are sent to it. */
export const WRITING_FIX_MESSAGE =
  'Review found writing notes in the attached parts. Fix each one in the text you changed this session, then check the writing again.';

/** The item a lesson or Quiz row stands for, as it is now or, removed, as it was. */
export const itemOf = (row: Extract<ChangeRow, { kind: 'lesson' | 'quiz' }>): Item =>
  (row.after ?? row.before) as Item;

/** "Compared with Draft v4, 18 Nov"; a new course has no draft to compare with. */
export function comparedLine(base: { rev: number; savedAt: string | null } | null): string {
  if (base === null) return 'A new course: everything in it is added.';
  const day = base.savedAt
    ? `, ${new Date(base.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : '';
  return `Compared with Draft v${base.rev}${day}`;
}
