import type { Working } from '../../types';
import {
  COURSE_BYTES_LIMIT,
  authoringSessionSchema,
  courseBytes,
  formatBytes,
  workingSchema,
} from '@gurukul/schema';

import { z } from 'zod';
import { pictureProblem } from './pictures';
import type { SessionState } from './types';

/** A zod issue, read loosely: only what the sentences below need. */
interface Issue {
  code: string;
  path: PropertyKey[];
  message: string;
  maximum?: unknown;
  minimum?: unknown;
  origin?: unknown;
  /** On `invalid_union`: the issues of each option of the union. */
  errors?: Issue[][];
}

/** What a list holds, for "A lesson holds at most 60 blocks." */
const LISTS: Record<string, string> = {
  chapters: 'A course holds at most {n} chapters.',
  items: 'A chapter holds at most {n} lessons and Quizzes.',
  blocks: 'A lesson holds at most {n} blocks. Split it into two lessons, or remove a block first.',
  questions: 'A Quiz holds at most {n} questions.',
  outcomes: 'A course has at most {n} outcomes.',
  goals: 'A session has at most {n} goals.',
  todos: 'A session has at most {n} to-dos. Resolve or combine some first.',
};

const asRecord = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/** One entry of a list as words: `chapter "Basics" (p1)`, `block 3 (code)`, `question 2`. */
function entryName(list: string, index: number, entry: unknown): string {
  const e = asRecord(entry);
  const title = typeof e['title'] === 'string' ? e['title'] : '';
  const id = String(e['id']);
  const called = title.trim() === '' ? `"${id}"` : `"${title}" (${id})`;
  switch (list) {
    case 'chapters':
      return `chapter ${called}`;
    case 'items':
      return `${e['type'] === 'quiz' ? 'Quiz' : 'lesson'} ${called}`;
    case 'blocks':
      return `block ${index + 1} (${String(e['type'])})`;
    case 'questions':
      return `question ${index + 1}`;
    case 'options':
      return `answer ${index + 1}`;
    default:
      return `${list} ${index + 1}`;
  }
}

/** The issue in one sentence, naming where it is in words: `In lesson "Rebase" (l2), title cannot be empty.` */
export function describeIssue(root: unknown, issue: Issue): string {
  // A lesson or Quiz is a union: say what is wrong with the option it is closest to being. An
  // option that does not know the value's keys at all (`{ keep }` for a whole block) is the
  // furthest, whatever its count.
  if (issue.code === 'invalid_union' && issue.errors && issue.errors.length > 0) {
    const distance = (option: Issue[]) =>
      option.length +
      (option.some((i) => i.code === 'unrecognized_keys' && i.path.length === 0) ? 1_000 : 0);
    const closest = issue.errors.reduce((a, b) => (distance(b) < distance(a) ? b : a));
    const first = closest[0];
    if (first) return describeIssue(root, { ...first, path: [...issue.path, ...first.path] });
  }
  const places: string[] = [];
  let node: unknown = root;
  let list = '';
  let field = '';
  for (const key of issue.path) {
    if (typeof key === 'number') {
      node = (node as unknown[] | undefined)?.[key];
      places.push(entryName(list, key, node));
      field = '';
    } else {
      list = String(key);
      field = list;
      node = asRecord(node)[list];
    }
  }
  const max = issue.maximum;
  if (issue.code === 'too_big' && issue.origin === 'array' && LISTS[field])
    return (LISTS[field] as string).replace('{n}', String(max));
  const where = places.length > 0 ? `In ${places.join(' › ')}, ` : '';
  const what = field || 'the value';
  let sentence: string;
  if (issue.code === 'too_big' && issue.origin === 'string')
    sentence = `${what} is too long: at most ${String(max)} characters`;
  else if (issue.code === 'too_small' && issue.origin === 'string' && issue.minimum === 1)
    sentence = `${what} cannot be empty`;
  else if (issue.code === 'invalid_type' && issue.message.endsWith('received undefined'))
    sentence = `${what} is missing`;
  else sentence = field ? `${field}: ${issue.message}` : issue.message;
  const text = `${where}${sentence}.`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Several issues as at most three sentences, then how many more. */
export function describeIssues(root: unknown, issues: readonly Issue[]): string {
  const shown = issues.slice(0, 3).map((i) => describeIssue(root, i));
  const more = issues.length - shown.length;
  return more > 0 ? `${shown.join(' ')} And ${more} more.` : shown.join(' ');
}

/**
 * An issue's place by ids rather than positions (`chapters/#p1/items/#l2/title`), so the same
 * problem keeps its key when a chapter or block before it moves.
 */
function issueKey(root: unknown, issue: Issue): string {
  let node: unknown = root;
  const parts: string[] = [];
  for (const key of issue.path) {
    node = asRecord(node)[key as string];
    const id = asRecord(node)['id'];
    parts.push(typeof key === 'number' && typeof id === 'string' ? `#${id}` : String(key));
  }
  return `${parts.join('/')}:${issue.code}`;
}

/** Fields of the course no tool may change: they are about the course itself, its people and publishing. */
const FIXED = [
  'schemaVersion',
  'id',
  'educatorIds',
  'educatorNames',
  'status',
  'version',
  'publishedAt',
] as const;

const fixedOf = (w: Working) => JSON.stringify(FIXED.map((k) => w.course[k]));

/**
 * Why the edited working copy cannot replace the one before, or null when it can. It must keep the
 * course's id, Educators and publishing fields, pass the course schema, add no picture to
 * Markdown text and stay within the size limit. A draft that was already invalid or too big does not block the agent: only problems the
 * edit adds, and growth past the limit, are refused.
 */
export function workProblem(before: Working, after: Working): string | null {
  if (before === after) return null;
  if (fixedOf(before) !== fixedOf(after))
    return "No tool may change the course's id, Educators, status or version.";
  const parsed = workingSchema.safeParse(after);
  if (!parsed.success) {
    const old = workingSchema.safeParse(before);
    const known = new Set(old.error?.issues.map((i) => issueKey(before, i)));
    const added = parsed.error.issues.filter((i) => !known.has(issueKey(after, i)));
    if (added.length > 0) return `Nothing was changed. ${describeIssues(after, added)}`;
  }
  const picture = pictureProblem(before, after);
  if (picture) return picture;
  const bytes = courseBytes(after.course, after.answers);
  if (bytes > COURSE_BYTES_LIMIT && bytes > courseBytes(before.course, before.answers))
    return `Nothing was changed: the course would be ${formatBytes(bytes)}, over the limit of ${formatBytes(COURSE_BYTES_LIMIT)}. Make lessons shorter or remove content first.`;
  return null;
}

const shape = authoringSessionSchema.shape;
const sessionFields = z.object({
  title: shape.title,
  goals: shape.goals,
  summary: shape.summary,
  todos: shape.todos,
});

/** Why the session's own fields (title, goals, summary, to-dos) are not valid, or null. */
export function sessionProblem(state: SessionState): string | null {
  const fields = {
    title: state.title,
    goals: state.goals,
    summary: state.summary,
    todos: state.todos,
  };
  const parsed = sessionFields.safeParse(fields);
  return parsed.success
    ? null
    : `Nothing was changed. ${describeIssues(fields, parsed.error.issues)}`;
}
