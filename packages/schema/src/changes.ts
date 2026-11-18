import { diffLines, diffWordsWithSpace } from 'diff';
import type { Change } from 'diff';
import type { Block, BlockType, Chapter, Course, Item, Lesson, Question, Quiz } from './course';
import type { AnswerKeys } from './draft';

/*
 * What a Desktop Studio session changed in a course, one row per thing an Educator thinks of as a
 * unit: the Review screen reads it, and so does each turn's change count
 * (`.plan/22-desktop-studio.md`, "Review: the whole session at once").
 *
 * Everything is matched by id (items, blocks, questions, options), or by exact text for lists
 * without ids (outcomes, a check block's options). "Moved" is decided with a longest common
 * subsequence, so one insertion or deletion does not mark everything after it as moved.
 */

/** A course and its answer keys: the base a session started from, or its working copy (Studio's `Working`). */
export interface CourseCopy {
  course: Course;
  answers: AnswerKeys;
  /** Carried for the shape only: whether keys changed is worked out from `answers` themselves. */
  answersChanged?: true;
}

/** One run of a text difference: kept, added or removed. */
export type DiffOp = 'same' | 'added' | 'removed';

/**
 * A run of text in a difference. Joining the parts that are not `removed` gives the text after;
 * joining those that are not `added` gives the text before.
 */
export interface DiffPart {
  op: DiffOp;
  text: string;
}

/**
 * The most edits (tokens added or removed) a text difference looks for before giving up. A count,
 * not a time limit, so the answer never depends on the machine. Two unrelated 20,000-character
 * texts (the largest markdown block) give up in about 60 ms; similar texts finish in a few.
 */
const MAX_EDITS = 1000;

/** jsdiff's runs as parts; when it gave up, the whole text removed and the whole text added. */
function toParts(changes: Change[] | undefined, before: string, after: string): DiffPart[] {
  if (changes)
    return changes.map((c) => ({
      op: c.added ? 'added' : c.removed ? 'removed' : 'same',
      text: c.value,
    }));
  const out: DiffPart[] = [];
  if (before) out.push({ op: 'removed', text: before });
  if (after) out.push({ op: 'added', text: after });
  return out;
}

/**
 * Word-level difference for prose (titles, captions, markdown). Spaces and line breaks are kept.
 * Texts too different to compare within the edit bound come back as one removed and one added part.
 */
export function wordDiff(before: string, after: string): DiffPart[] {
  return toParts(diffWordsWithSpace(before, after, { maxEditLength: MAX_EDITS }), before, after);
}

/**
 * Line-level difference for code: one part per run of kept, added or removed lines. Code too
 * different to compare within the edit bound comes back as one removed and one added part.
 */
export function lineDiff(before: string, after: string): DiffPart[] {
  return toParts(diffLines(before, after, { maxEditLength: MAX_EDITS }), before, after);
}

/** A field's value as the Review shows it; null means absent (not set). */
export type FieldValue = string | number | boolean | null;

/**
 * One field that differs, as before → after. A field holding an object (the cover image, an
 * uploaded file) is compared whole but shown as a short label: its `url`, else its upload `path`.
 * The two labels can then be equal (a new BlurHash for the same file): the field still changed.
 */
export interface FieldChange {
  /** Dotted path from the row or entry: `title`, `rules.passMark`, `cover.image`, `md`, `upload`. */
  field: string;
  before: FieldValue;
  after: FieldValue;
  /**
   * Word difference, on prose fields (titles, summaries, captions, alt, labels, markdown, prompts),
   * when both sides are text. A field set or cleared (one side null) has none: before → after says it.
   */
  words?: DiffPart[];
  /** Line difference, on code (a code block's `code`, a question's `code`), when both sides are text. */
  lines?: DiffPart[];
}

/** What happened to a row. `renamed` is for chapters only (the title changed). */
export type RowStatus = 'added' | 'changed' | 'removed' | 'moved' | 'renamed';

/** Where a moved lesson or Quiz was and is: chapter ids and indexes within those chapters. */
export interface Move {
  fromChapterId: string;
  fromIndex: number;
  toChapterId: string;
  toIndex: number;
}

/**
 * An option, outcome, block or question inside a row. Unchanged entries are kept, with no
 * statuses, so the Review can say "3 unchanged blocks". Entries without ids (outcomes, a check
 * block's options) are named `#<index in the working copy>`, or `removed#<index in the base>`
 * when they are gone.
 */
export interface ListEntryChange {
  id: string;
  /** Empty when unchanged. `added` and `removed` come alone; `changed` and `moved` can come together. */
  statuses: ('added' | 'changed' | 'removed' | 'moved')[];
  /** The whole entry before, or null when it was added. */
  before: FieldValue | object | null;
  /** The whole entry after, or null when it was removed. */
  after: FieldValue | object | null;
  fields: FieldChange[];
}

/**
 * A changed correct answer, called out on its own, never folded into a field. Ids are the entry ids
 * of `options` beside it: option ids for a Quiz question, `#<index>` for a check block.
 */
export interface AnswerChange {
  before: string[];
  after: string[];
}

/** A block in a lesson row. A check block also carries its options and its correct answer. */
export interface BlockChange extends ListEntryChange {
  type: BlockType;
  options?: ListEntryChange[];
  answer?: AnswerChange;
}

/** A question in a Quiz row, with its options by id and, when its key differs, its answer. */
export interface QuestionChange extends ListEntryChange {
  options: ListEntryChange[];
  answer?: AnswerChange;
}

/**
 * One row of the Review list. `key` is the row's unique id, `<kind>:<id>` (`course:course`,
 * `chapter:p1`, `lesson:l2`, `quiz:l2`): what the Review's Viewed ticks store. A repeated id within
 * a kind (the schema allows one) gets `#2`, `#3`… on its later rows, in display order. Lesson and
 * Quiz rows name their chapter so the list can group them.
 */
export type ChangeRow =
  | { key: string; kind: 'course'; id: 'course'; statuses: RowStatus[]; fields: FieldChange[] }
  | {
      key: string;
      kind: 'landing';
      id: 'landing';
      statuses: RowStatus[];
      fields: FieldChange[];
      outcomes: ListEntryChange[];
    }
  | {
      key: string;
      kind: 'chapter';
      id: string;
      statuses: RowStatus[];
      before: Chapter | null;
      after: Chapter | null;
      fields: FieldChange[];
      move?: { fromIndex: number; toIndex: number };
    }
  | {
      key: string;
      kind: 'lesson';
      id: string;
      chapterId: string;
      statuses: RowStatus[];
      before: Lesson | null;
      after: Lesson | null;
      fields: FieldChange[];
      blocks: BlockChange[];
      move?: Move;
    }
  | {
      key: string;
      kind: 'quiz';
      id: string;
      chapterId: string;
      statuses: RowStatus[];
      before: Quiz | null;
      after: Quiz | null;
      fields: FieldChange[];
      questions: QuestionChange[];
      move?: Move;
    };

/**
 * A correct answer that changed on something present before and after: a Quiz question
 * (`itemId` is the Quiz) or a check block (`itemId` is the lesson). Added and removed ones are not
 * listed; their rows already say so.
 */
export interface ChangedAnswer {
  kind: 'question' | 'check';
  itemId: string;
  /** The question's or the block's id. */
  id: string;
}

/** Everything a session changed, in display order. */
export interface CourseChanges {
  /** Only rows with at least one status, in the order the Review lists them. */
  rows: ChangeRow[];
  /** `rows.length`: the header's "11 changes". */
  count: number;
  /** Every changed correct answer, in row order, called out apart from the rows. */
  answerChanges: ChangedAnswer[];
}

type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A row before its key is given. */
type RowBody = Without<ChangeRow, 'key'>;

// ─── Fields ──────────────────────────────────────────────────────────────────────────────────────

type FieldKind = 'plain' | 'words' | 'lines';
type FieldSpec = readonly (readonly [field: string, kind: FieldKind])[];

/** JSON with object keys sorted, so two equal values always compare equal (as in `draft.ts`). */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );

const read = (value: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>((o, k) => (o as Record<string, unknown> | null | undefined)?.[k], value);

function shown(value: unknown): FieldValue {
  if (value == null) return null;
  if (typeof value !== 'object') return value as string | number | boolean;
  const o = value as { url?: unknown; path?: unknown };
  return typeof o.url === 'string' ? o.url : typeof o.path === 'string' ? o.path : stable(value);
}

const TEXT_DIFFS = { words: wordDiff, lines: lineDiff } as const;

/** The fields in `spec` that differ between two versions of the same thing (either may be null). */
function fieldChanges(spec: FieldSpec, before: unknown, after: unknown): FieldChange[] {
  const out: FieldChange[] = [];
  for (const [field, kind] of spec) {
    const b = read(before, field);
    const a = read(after, field);
    if (stable(b) === stable(a)) continue;
    const change: FieldChange = { field, before: shown(b), after: shown(a) };
    if (kind !== 'plain' && typeof b === 'string' && typeof a === 'string')
      change[kind] = TEXT_DIFFS[kind](b, a);
    out.push(change);
  }
  return out;
}

const COURSE_FIELDS: FieldSpec = [
  ['title', 'words'],
  ['summary', 'words'],
  ['level', 'plain'],
  ['cover.theme', 'plain'],
  ['cover.glyph', 'plain'],
  ['cover.image', 'plain'],
  ['rules.sequential', 'plain'],
  ['rules.passMark', 'plain'],
  ['rules.certificate', 'plain'],
  ['rules.requireVideoWatch', 'plain'],
  ['certificate.title', 'words'],
];
const LANDING_FIELDS: FieldSpec = [['description', 'words']];
const TITLE_FIELDS: FieldSpec = [['title', 'words']];
const TEXT_FIELDS: FieldSpec = [['text', 'words']];
const LESSON_FIELDS: FieldSpec = [
  ['title', 'words'],
  ['minutes', 'plain'],
  ['layout', 'plain'],
  ['completeWhen', 'plain'],
  ['kindLabel', 'words'],
];
const QUIZ_FIELDS: FieldSpec = [
  ['title', 'words'],
  ['passMark', 'plain'],
  ['questionsShown', 'plain'],
  ['shuffleOptions', 'plain'],
  ['cooldownMinutes', 'plain'],
  ['revealAnswers', 'plain'],
  ['blocksNext', 'plain'],
];
const QUESTION_FIELDS: FieldSpec = [
  ['kind', 'plain'],
  ['prompt', 'words'],
  ['code', 'lines'],
  ['explanation', 'words'],
  ['reviewItemId', 'plain'],
];
/** A check block's `options` and `correct` are compared as a list and an answer, not as fields. */
const BLOCK_FIELDS: Record<BlockType, FieldSpec> = {
  markdown: [['md', 'words']],
  callout: [
    ['tone', 'plain'],
    ['title', 'words'],
    ['md', 'words'],
  ],
  code: [
    ['lang', 'plain'],
    ['file', 'plain'],
    ['code', 'lines'],
    ['copy', 'plain'],
    ['terminal', 'plain'],
    ['highlight', 'plain'],
  ],
  video: [
    ['provider', 'plain'],
    ['url', 'plain'],
    ['captions', 'plain'],
    ['title', 'words'],
    ['caption', 'words'],
    ['durationSec', 'plain'],
  ],
  image: [
    ['url', 'plain'],
    ['alt', 'words'],
    ['caption', 'words'],
    ['layout', 'plain'],
    ['zoom', 'plain'],
    ['border', 'plain'],
    ['width', 'plain'],
    ['height', 'plain'],
    ['upload', 'plain'],
  ],
  embed: [
    ['url', 'plain'],
    ['title', 'words'],
  ],
  file: [
    ['url', 'plain'],
    ['label', 'words'],
    ['upload', 'plain'],
  ],
  check: [
    ['prompt', 'words'],
    ['explanation', 'words'],
  ],
};

// ─── Aligning two lists ──────────────────────────────────────────────────────────────────────────

/** One entry of two aligned lists. `value` is `after`, or `before` when the entry was removed. */
interface Paired<T> {
  /** What the two sides were matched on; unique within the list. */
  key: string;
  /** The entry's own id (or `#<index>` for text), as reported. */
  id: string;
  value: T;
  before: T | null;
  after: T | null;
  /** Index in the base list, -1 when added. */
  beforeIndex: number;
  /** Index in the working list, -1 when removed. */
  afterIndex: number;
  /** On both sides, but out of the order the two sides share. */
  moved: boolean;
}

interface Keyed<T> {
  key: string;
  entry: T;
  index: number;
}

/**
 * Each entry with a key unique in its list. The schema allows a repeated id (only publishing
 * refuses one), so the n-th entry with an id is matched with the n-th on the other side: the
 * second `l2` is keyed `l2`, NUL, `2`.
 */
function keyed<T>(list: readonly T[], key: (entry: T) => string): Keyed<T>[] {
  const seen = new Map<string, number>();
  return list.map((entry, index) => {
    const k = key(entry);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return { key: n === 1 ? k : `${k}\u0000${n}`, entry, index };
  });
}

/** Index pairs of one longest common subsequence of `a` and `b`; ties keep the earlier `a` entry. */
function lcs(a: readonly string[], b: readonly string[]): [number, number][] {
  const w = b.length + 1;
  const t = new Array<number>((a.length + 1) * w).fill(0);
  const at = (i: number, j: number) => t[i * w + j] as number;
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      t[i * w + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) out.push([i++, j++]);
    else if (at(i + 1, j) >= at(i, j + 1)) i++;
    else j++;
  }
  return out;
}

/**
 * Aligns two lists by key (the id by default; repeats paired in order, see `keyed`). Entries on
 * both sides are moved when they fall outside the longest common subsequence of the shared keys'
 * order. Output follows the working list; each removed entry comes right after the nearest entry
 * before it in the base that is still there and not moved (or first, when there is none), several
 * in their base order.
 */
function alignById<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
  key: (entry: T) => string = (entry) => entry.id,
): Paired<T>[] {
  const was = keyed(before, key);
  const now = keyed(after, key);
  const wasByKey = new Map(was.map((k) => [k.key, k]));
  const nowKeys = new Set(now.map((k) => k.key));
  const sharedBefore = was.map((k) => k.key).filter((k) => nowKeys.has(k));
  const sharedAfter = now.map((k) => k.key).filter((k) => wasByKey.has(k));
  const kept = new Set(lcs(sharedBefore, sharedAfter).map(([i]) => sharedBefore[i]));

  const removedAfter = new Map<string | null, Paired<T>[]>();
  let anchor: string | null = null;
  for (const { key: k, entry, index } of was) {
    if (kept.has(k)) anchor = k;
    else if (!nowKeys.has(k)) {
      const group = removedAfter.get(anchor) ?? [];
      group.push({
        key: k,
        id: entry.id,
        value: entry,
        before: entry,
        after: null,
        beforeIndex: index,
        afterIndex: -1,
        moved: false,
      });
      removedAfter.set(anchor, group);
    }
  }

  const out = [...(removedAfter.get(null) ?? [])];
  for (const { key: k, entry, index } of now) {
    const old = wasByKey.get(k);
    out.push({
      key: k,
      id: entry.id,
      value: entry,
      before: old ? old.entry : null,
      after: entry,
      beforeIndex: old ? old.index : -1,
      afterIndex: index,
      moved: old !== undefined && !kept.has(k),
    });
    out.push(...(removedAfter.get(k) ?? []));
  }
  return out;
}

/**
 * Aligns two lists of strings that have no ids: exact text matches along a longest common
 * subsequence stay put; between two matches, leftover removed and added strings pair up in order as
 * rewordings, and any extra are removed or added. Text never counts as moved.
 */
function alignByText(before: readonly string[], after: readonly string[]): Paired<string>[] {
  const pair = (bi: number, aj: number): Paired<string> => {
    const b = before[bi] ?? null;
    const a = after[aj] ?? null;
    const id = aj >= 0 ? `#${aj}` : `removed#${bi}`;
    return {
      key: id,
      id,
      value: a ?? (b as string),
      before: b,
      after: a,
      beforeIndex: bi,
      afterIndex: aj,
      moved: false,
    };
  };
  const out: Paired<string>[] = [];
  let i = 0;
  let j = 0;
  for (const [mi, mj] of [...lcs(before, after), [before.length, after.length] as const]) {
    for (let k = 0; k < Math.max(mi - i, mj - j); k++)
      out.push(pair(i + k < mi ? i + k : -1, j + k < mj ? j + k : -1));
    if (mi < before.length) out.push(pair(mi, mj));
    i = mi + 1;
    j = mj + 1;
  }
  return out;
}

// ─── Entries ─────────────────────────────────────────────────────────────────────────────────────

/** Added and removed come alone; otherwise the edit (if any) then `moved` (if moved). */
function statusesOf<E extends string>(
  p: { before: unknown; after: unknown },
  edited: boolean,
  edit: E,
  moved: boolean,
): ('added' | 'removed' | 'moved' | E)[] {
  if (p.before === null) return ['added'];
  if (p.after === null) return ['removed'];
  return [...(edited ? [edit] : []), ...(moved ? (['moved'] as const) : [])];
}

function entry<T extends string | object>(
  p: Paired<T>,
  fields: FieldChange[],
  innerChanged: boolean,
): ListEntryChange {
  return {
    id: p.id,
    statuses: statusesOf(p, fields.length > 0 || innerChanged, 'changed', p.moved),
    before: p.before,
    after: p.after,
    fields,
  };
}

const touched = (entries: readonly { statuses: readonly string[] }[]) =>
  entries.some((e) => e.statuses.length > 0);

/** Same ids, ignoring order and repeats. */
const sameSet = (a: readonly string[], b: readonly string[]) =>
  stable([...new Set(a)].sort()) === stable([...new Set(b)].sort());

function textEntries(pairs: readonly Paired<string>[]): ListEntryChange[] {
  return pairs.map((p) =>
    entry(p, fieldChanges(TEXT_FIELDS, { text: p.before }, { text: p.after }), false),
  );
}

type CheckBlock = Extract<Block, { type: 'check' }>;

/** The text of a check block's right option; undefined when none is marked (or the mark is stale). */
const rightText = (check: CheckBlock | null) =>
  check?.correct === undefined ? undefined : check.options[check.correct];

/**
 * A check block's right answer changed when the text of its right option differs, or one side has
 * none: moving the same option elsewhere is not a change, rewording the right one is. Reported as
 * the entry ids of `options`.
 */
function checkAnswer(
  pairs: readonly Paired<string>[],
  was: CheckBlock | null,
  now: CheckBlock | null,
): AnswerChange | undefined {
  if (rightText(was) === rightText(now)) return undefined;
  const ids = (pick: (p: Paired<string>) => boolean) => pairs.filter(pick).map((p) => p.id);
  return {
    before: ids((p) => p.beforeIndex === was?.correct),
    after: ids((p) => p.afterIndex === now?.correct),
  };
}

/** A block type this version does not know (a malformed working copy) has no fields to compare. */
const specOf = (type: string): FieldSpec => BLOCK_FIELDS[type as BlockType] ?? [];

/** Field spec for a block; when its type changed under the same id, `type` plus both types' fields. */
function blockSpec(before: Block | null, after: Block | null, value: Block): FieldSpec {
  if (!before || !after || before.type === after.type) return specOf(value.type);
  const first = specOf(before.type);
  const extra = specOf(after.type).filter(([f]) => !first.some(([g]) => g === f));
  return [['type', 'plain'], ...first, ...extra];
}

const asCheck = (b: Block | null) => (b?.type === 'check' ? b : null);

function blockEntries(before: readonly Block[], after: readonly Block[]): BlockChange[] {
  return alignById(before, after).map((p) => {
    const fields = fieldChanges(blockSpec(p.before, p.after, p.value), p.before, p.after);
    const was = asCheck(p.before);
    const now = asCheck(p.after);
    if (!was && !now) return { ...entry(p, fields, false), type: p.value.type };
    const pairs = alignByText(was?.options ?? [], now?.options ?? []);
    const options = textEntries(pairs);
    const answer = checkAnswer(pairs, was, now);
    return {
      ...entry(p, fields, touched(options) || answer !== undefined),
      type: p.value.type,
      options,
      ...(answer ? { answer } : {}),
    };
  });
}

/** A question's key in one copy; a question missing on that side has none. */
const keyOf = (keys: AnswerKeys, quizId: string, q: Question | null): string[] =>
  q ? (keys[quizId]?.[q.id] ?? []) : [];

function questionEntries(
  quizId: string,
  before: readonly Question[],
  after: readonly Question[],
  baseKeys: AnswerKeys,
  workKeys: AnswerKeys,
): QuestionChange[] {
  return alignById(before, after).map((p) => {
    const fields = fieldChanges(QUESTION_FIELDS, p.before, p.after);
    const options = alignById(p.before?.options ?? [], p.after?.options ?? []).map((o) =>
      entry(o, fieldChanges(TEXT_FIELDS, o.before, o.after), false),
    );
    const was = keyOf(baseKeys, quizId, p.before);
    const now = keyOf(workKeys, quizId, p.after);
    const answer = sameSet(was, now) ? undefined : { before: was, after: now };
    return {
      ...entry(p, fields, touched(options) || answer !== undefined),
      options,
      ...(answer ? { answer } : {}),
    };
  });
}

// ─── Rows ────────────────────────────────────────────────────────────────────────────────────────

function courseRow(was: Course | null, now: Course): RowBody {
  const fields = fieldChanges(COURSE_FIELDS, was, now);
  const statuses = statusesOf({ before: was, after: now }, fields.length > 0, 'changed', false);
  return { kind: 'course', id: 'course', statuses, fields };
}

function landingRow(was: Course | null, now: Course): RowBody {
  const fields = fieldChanges(LANDING_FIELDS, was, now);
  const outcomes = textEntries(alignByText(was?.outcomes ?? [], now.outcomes));
  const edited = fields.length > 0 || touched(outcomes);
  const statuses = statusesOf({ before: was, after: now }, edited, 'changed', false);
  return { kind: 'landing', id: 'landing', statuses, fields, outcomes };
}

function chapterRow(p: Paired<Chapter>): RowBody {
  const fields = fieldChanges(TITLE_FIELDS, p.before, p.after);
  return {
    kind: 'chapter',
    id: p.id,
    statuses: statusesOf(p, fields.length > 0, 'renamed', p.moved),
    before: p.before,
    after: p.after,
    fields,
    ...(p.moved ? { move: { fromIndex: p.beforeIndex, toIndex: p.afterIndex } } : {}),
  };
}

const asLesson = (i: Item | null) => (i?.type === 'lesson' ? i : null);
const asQuiz = (i: Item | null) => (i?.type === 'quiz' ? i : null);

interface ItemContext {
  chapterId: string;
  move: Move | undefined;
  baseKeys: AnswerKeys;
  workKeys: AnswerKeys;
}

function lessonRow(before: Lesson | null, after: Lesson | null, id: string, cx: ItemContext) {
  const fields = fieldChanges(LESSON_FIELDS, before, after);
  const blocks = blockEntries(before?.blocks ?? [], after?.blocks ?? []);
  const edited = fields.length > 0 || touched(blocks);
  return {
    kind: 'lesson' as const,
    id,
    chapterId: cx.chapterId,
    statuses: statusesOf({ before, after }, edited, 'changed', cx.move !== undefined),
    before,
    after,
    fields,
    blocks,
    ...(cx.move ? { move: cx.move } : {}),
  };
}

function quizRow(before: Quiz | null, after: Quiz | null, id: string, cx: ItemContext) {
  const fields = fieldChanges(QUIZ_FIELDS, before, after);
  const questions = questionEntries(
    id,
    before?.questions ?? [],
    after?.questions ?? [],
    cx.baseKeys,
    cx.workKeys,
  );
  const edited = fields.length > 0 || touched(questions);
  return {
    kind: 'quiz' as const,
    id,
    chapterId: cx.chapterId,
    statuses: statusesOf({ before, after }, edited, 'changed', cx.move !== undefined),
    before,
    after,
    fields,
    questions,
    ...(cx.move ? { move: cx.move } : {}),
  };
}

/** Where an item sits in one copy. `key` is unique in the course; `chapterKey` names its chapter. */
interface Location {
  id: string;
  key: string;
  chapterKey: string;
  chapterId: string;
  index: number;
  item: Item;
}

/**
 * Every item of a course with where it sits. Items are matched by type and id, so a lesson turned
 * into a Quiz under the same id reads as one removed and one added (rows `lesson:x` and `quiz:x`).
 * Repeated ids are numbered across the whole course, chapters by the same rule as `alignById`.
 */
function locate(course: Course | null): Location[] {
  const chapters = keyed(course?.chapters ?? [], (chapter) => chapter.id);
  const items = chapters.flatMap(({ key: chapterKey, entry: chapter }) =>
    chapter.items.map((item, index) => ({ chapterKey, chapterId: chapter.id, index, item })),
  );
  return keyed(items, (at) => `${at.item.type}:${at.item.id}`).map(({ key, entry }) => ({
    ...entry,
    key,
    id: entry.item.id,
  }));
}

/** Moved: in another chapter in the base, or out of the shared order within the same chapter. */
function moveOf(origin: Location | undefined, p: Paired<Location>, chapter: Paired<Chapter>) {
  if (!origin || p.after === null || (origin.chapterKey === chapter.key && !p.moved))
    return undefined;
  return {
    fromChapterId: origin.chapterId,
    fromIndex: origin.index,
    toChapterId: chapter.id,
    toIndex: p.afterIndex,
  };
}

/**
 * Chapter rows and their item rows, in the working copy's order. Within a chapter, the base list
 * holds only the items that stay in it or are gone from the course; items that came from another
 * chapter are matched with their old place (moved). A removed chapter is followed by its removed
 * items.
 */
function chapterRows(
  was: Course | null,
  now: Course,
  baseKeys: AnswerKeys,
  workKeys: AnswerKeys,
): RowBody[] {
  const fromList = locate(was);
  const toList = locate(now);
  const from = new Map(fromList.map((at) => [at.key, at]));
  const to = new Map(toList.map((at) => [at.key, at]));
  const rows: RowBody[] = [];
  for (const chapter of alignById(was?.chapters ?? [], now.chapters)) {
    rows.push(chapterRow(chapter));
    const stays = fromList.filter(
      (at) =>
        at.chapterKey === chapter.key &&
        (to.get(at.key)?.chapterKey ?? chapter.key) === chapter.key,
    );
    const here = toList.filter((at) => at.chapterKey === chapter.key);
    for (const p of alignById(stays, here, (at) => at.key)) {
      const origin = from.get(p.key);
      const before = origin ? origin.item : null;
      const after = p.after ? p.after.item : null;
      const cx = { chapterId: chapter.id, move: moveOf(origin, p, chapter), baseKeys, workKeys };
      rows.push(
        p.value.item.type === 'lesson'
          ? lessonRow(asLesson(before), asLesson(after), p.id, cx)
          : quizRow(asQuiz(before), asQuiz(after), p.id, cx),
      );
    }
  }
  return rows;
}

/** Gives each row its key, `<kind>:<id>`, with `#2`, `#3`… on later rows that would repeat one. */
function withKeys(rows: readonly RowBody[]): ChangeRow[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = `${row.kind}:${row.id}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return { ...row, key: n === 1 ? key : `${key}#${n}` };
  });
}

/** On both sides, with an answer that differs. */
const answerChanged = (e: { answer?: AnswerChange; before: unknown; after: unknown }) =>
  e.answer !== undefined && e.before !== null && e.after !== null;

function answerChangesOf(rows: readonly ChangeRow[]): ChangedAnswer[] {
  return rows.flatMap((row): ChangedAnswer[] => {
    if (row.kind === 'quiz')
      return row.questions
        .filter(answerChanged)
        .map((q) => ({ kind: 'question', itemId: row.id, id: q.id }));
    if (row.kind === 'lesson')
      return row.blocks
        .filter((b) => answerChanged(b) && b.type === 'check' && asCheck(b.before as Block))
        .map((b) => ({ kind: 'check', itemId: row.id, id: b.id }));
    return [];
  });
}

/**
 * Every change a session made, row by row, comparing `work` with `base` (null for a course the
 * session created: every row is then added). Rows come in the Review's order: Course details,
 * Landing page, then each chapter in the working copy's order followed by its lessons and Quizzes.
 * A removed chapter or item is listed where it used to be: right after the nearest entry before it
 * in the base that is still in the same list and not moved, or first when there is none. Only rows
 * with a status are returned; changed correct answers are also listed in `answerChanges`.
 */
export function courseChanges(base: CourseCopy | null, work: CourseCopy): CourseChanges {
  const was = base ? base.course : null;
  const rows = withKeys(
    [
      courseRow(was, work.course),
      landingRow(was, work.course),
      ...chapterRows(was, work.course, base ? base.answers : {}, work.answers),
    ].filter((row) => row.statuses.length > 0),
  );
  return { rows, count: rows.length, answerChanges: answerChangesOf(rows) };
}
