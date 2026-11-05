import type { z } from 'zod';
import type { PublishIssue } from './draft';

/**
 * Turns what the course schema refused into sentences an Educator can act on: "The title of lesson
 * 2 in chapter 1 is empty." Fields an Educator cannot edit (the schema version, ids, the publish
 * bookkeeping) are never offered as something to fix: they become one `schema.outdated` issue that
 * says to reload. The zod wording and the field path never reach the text.
 */

/** Top-level fields Gurukul writes, never the Educator. */
const INTERNAL = new Set([
  'schemaVersion',
  'id',
  'version',
  'publishedAt',
  'status',
  'educatorIds',
  'educatorNames',
  'estimatedMinutes',
  'rev',
]);

export const OUTDATED_MESSAGE =
  'This draft was saved by an older version of Gurukul. Reload the page; if this stays, use Report issue.';

const TOP: Record<string, string> = {
  title: 'The course title',
  summary: 'The summary',
  description: 'The landing page description',
  level: 'The level',
  outcomes: 'The learning outcomes',
  rules: 'The learning rules',
  certificate: 'The certificate title',
  chapters: 'The chapter list',
};

/** Item settings an Educator edits, by the words the editor uses for them. */
const ITEM_FIELDS: Record<string, string> = {
  minutes: 'length in minutes',
  questionsShown: 'number of questions shown',
  cooldownMinutes: 'wait between attempts',
};

type Path = readonly PropertyKey[];
const at = (value: unknown, key: PropertyKey): unknown =>
  value !== null && typeof value === 'object'
    ? (value as Record<PropertyKey, unknown>)[key]
    : undefined;
const nth = (n: PropertyKey) => (typeof n === 'number' ? n + 1 : '?');

/** True for a field an Educator cannot change: an id anywhere, or Gurukul's own bookkeeping. */
export function isInternal(path: Path): boolean {
  return INTERNAL.has(String(path[0])) || path[path.length - 1] === 'id';
}

/** What a field is called on screen, e.g. "Question 2 of Quiz 3 in chapter 1". */
export function fieldName(path: Path, course: unknown): string {
  const [first, a, b, c, d, e] = path;
  if (first === 'outcomes' && a !== undefined) return `Outcome ${nth(a)}`;
  if (first === 'cover') return a === 'image' ? 'The cover image' : 'The cover theme';
  if (first !== 'chapters' || a === undefined) return TOP[String(first)] ?? 'The course';
  const chapter = `chapter ${nth(a)}`;
  if (b === 'title') return `The title of ${chapter}`;
  if (b !== 'items' || c === undefined) return `Chapter ${nth(a)}`;
  const type = at(at(at(at(at(course, 'chapters'), a), 'items'), c), 'type');
  const item = `${type === 'quiz' ? 'Quiz' : 'lesson'} ${nth(c)} in ${chapter}`;
  if (d === 'title') return `The title of ${item}`;
  if (typeof d === 'string' && ITEM_FIELDS[d]) return `The ${ITEM_FIELDS[d]} of ${item}`;
  if (d === 'blocks' && e !== undefined) return `Block ${nth(e)} of ${item}`;
  if (d === 'questions' && e !== undefined) return `Question ${nth(e)} of ${item}`;
  return item.charAt(0).toUpperCase() + item.slice(1);
}

/** What is wrong with a field, as the end of a sentence: "is empty", "is too long (at most 160 characters)". */
export function problemWords(issue: z.core.$ZodIssue): string {
  if (issue.code === 'too_small' || issue.code === 'too_big') {
    const small = issue.code === 'too_small';
    const limit = Number(small ? issue.minimum : issue.maximum);
    const bound = small ? 'at least' : 'at most';
    if (issue.origin === 'string') {
      if (small && limit <= 1) return 'is empty';
      return `is too ${small ? 'short' : 'long'} (${bound} ${limit} characters)`;
    }
    if (issue.origin === 'array')
      return `has too ${small ? 'few' : 'many'} entries (${bound} ${limit})`;
    if (issue.origin === 'number') return `is too ${small ? 'small' : 'large'} (${bound} ${limit})`;
  }
  if (issue.code === 'invalid_format' && issue.format === 'url') return 'is not a web address';
  return 'has a value Gurukul does not accept';
}

/** The schema's refusals as Educator-facing issues; any number of internal ones become one. */
export function schemaIssues(issues: readonly z.core.$ZodIssue[], course: unknown): PublishIssue[] {
  const out: PublishIssue[] = [];
  let outdated = false;
  for (const issue of issues) {
    if (isInternal(issue.path)) outdated = true;
    else
      out.push({
        code: 'schema',
        message: `${fieldName(issue.path, course)} ${problemWords(issue)}.`,
      });
  }
  return outdated ? [{ code: 'schema.outdated', message: OUTDATED_MESSAGE }, ...out] : out;
}
