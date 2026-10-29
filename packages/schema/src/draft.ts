import { z } from 'zod';
import { COURSE_SCHEMA_VERSION, courseSchema } from './course';
import type { Block, Course, Item, Question } from './course';
import { isEmbedAllowed, videoEmbedUrl } from './media';
import { itemsOf } from './progress';
import { timestamp } from './timestamp';

/** Quiz answer keys as the Studio keeps them in a draft: `{ [parikshaId]: { [questionId]: optionIds } }`. */
export type AnswerKeys = Record<string, Record<string, string[]>>;

/**
 * `courses/{id}/drafts/current`: the course being edited plus its answer keys (Acharyas need them
 * to edit). `rev` goes up by one on every save; a save that does not carry the current rev is a
 * conflict. The keys move to `private/answers` only when the course is published.
 */
export const draftSchema = z.object({
  rev: z.number().int().min(0),
  updatedAt: timestamp,
  updatedBy: z.string().min(1),
  course: courseSchema,
  answers: z.record(z.string(), z.record(z.string(), z.array(z.string()))),
});
export type Draft = z.infer<typeof draftSchema>;

/** `lower-case-slug` from a title: accents dropped, anything else becomes a hyphen. */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/** A blank draft course for a new slug; the creator is its first Acharya. */
export function blankCourse(init: {
  id: string;
  title: string;
  level: Course['level'];
  theme: Course['cover']['theme'];
  acharyaId: string;
  /** The creator's display name; left out when unknown, and Studio falls back to "an Acharya". */
  acharyaName?: string | undefined;
}): Course {
  return {
    schemaVersion: COURSE_SCHEMA_VERSION,
    id: init.id,
    title: init.title,
    summary: '',
    description: '',
    level: init.level,
    cover: { theme: init.theme, glyph: init.title.trim().charAt(0).toUpperCase() || 'G' },
    outcomes: [],
    acharyaIds: [init.acharyaId],
    acharyaNames: init.acharyaName ? { [init.acharyaId]: init.acharyaName } : {},
    status: 'draft',
    version: 0,
    publishedAt: null,
    rules: { sequential: true, passMark: 0.7, certificate: true, requireVideoWatch: false },
    certificate: { title: init.title, signatoryName: '', signatoryRole: '' },
    parvas: [],
    estimatedMinutes: 0,
  };
}

/** Total lesson minutes: what `estimatedMinutes` is set to on publish. */
export function estimateMinutes(course: Pick<Course, 'parvas'>): number {
  return itemsOf(course).reduce((sum, i) => sum + (i.type === 'lesson' ? i.minutes : 0), 0);
}

export interface PublishIssue {
  /** Stable machine code, e.g. `block.image.alt`. */
  code: string;
  /** What to fix, in words an Acharya understands. */
  message: string;
  itemId?: string;
  blockId?: string;
  questionId?: string;
}

const blank = (s: string) => s.trim() === '';

function blockIssues(itemId: string, b: Block): PublishIssue[] {
  const at = { itemId, blockId: b.id };
  const issue = (code: string, message: string): PublishIssue => ({ code, message, ...at });
  switch (b.type) {
    case 'video':
      return videoEmbedUrl(b.provider, b.url) === null
        ? [
            issue(
              'block.video.url',
              'The video link is not a supported YouTube, Drive or Loom address.',
            ),
          ]
        : [];
    case 'markdown':
      return blank(b.md) ? [issue('block.markdown.empty', 'A text block is empty.')] : [];
    case 'code':
      return blank(b.code) ? [issue('block.code.empty', 'A code block is empty.')] : [];
    case 'callout':
      return blank(b.md) ? [issue('block.callout.empty', 'A callout has no text.')] : [];
    case 'image':
      return blank(b.alt)
        ? [issue('block.image.alt', 'An image needs alt text for people who cannot see it.')]
        : [];
    case 'embed':
      return isEmbedAllowed(b.url)
        ? []
        : [
            issue(
              'block.embed.host',
              'This embed address is not on the allowed list (YouTube, Loom, Google Drive, CodeSandbox, StackBlitz).',
            ),
          ];
    case 'file':
      return blank(b.label) ? [issue('block.file.label', 'A file link needs a label.')] : [];
    case 'check': {
      const out: PublishIssue[] = [];
      if (blank(b.prompt))
        out.push(issue('block.check.prompt', 'A check question has no question text.'));
      if (b.options.filter((o) => !blank(o)).length < 2)
        out.push(issue('block.check.options', 'A check question needs at least two answers.'));
      if (blank(b.explanation))
        out.push(issue('block.check.explanation', 'A check question needs an explanation.'));
      return out;
    }
  }
}

function questionIssues(
  itemId: string,
  q: Question,
  key: readonly string[] | undefined,
): PublishIssue[] {
  const at = { itemId, questionId: q.id };
  const issue = (code: string, message: string): PublishIssue => ({ code, message, ...at });
  const out: PublishIssue[] = [];
  if (blank(q.prompt)) out.push(issue('question.prompt', 'A question has no text.'));
  if (q.options.length < 2 || q.options.length > 6)
    out.push(issue('question.options.count', 'A question needs between 2 and 6 answers.'));
  if (q.options.some((o) => blank(o.text)))
    out.push(issue('question.options.empty', 'An answer is empty.'));
  if (blank(q.explanation))
    out.push(issue('question.explanation', 'A question needs an explanation.'));
  const ids = new Set(q.options.map((o) => o.id));
  const correct = key ?? [];
  if (correct.length === 0) out.push(issue('question.key.missing', 'Mark the correct answer.'));
  else if (correct.some((id) => !ids.has(id)))
    out.push(issue('question.key.unknown', 'The marked answer no longer exists.'));
  else if (q.kind !== 'multiple' && correct.length !== 1)
    out.push(issue('question.key.single', 'This question type has exactly one correct answer.'));
  return out;
}

/**
 * Everything that stops a course being published, in the order an Acharya would fix it. The same
 * function runs in the Studio (inline messages) and in `publishCourse` (the gate), so they agree.
 * An empty list means publishable.
 */
export function validateForPublish(course: Course, answers: AnswerKeys): PublishIssue[] {
  const out: PublishIssue[] = [];
  const parsed = courseSchema.safeParse(course);
  if (!parsed.success) {
    // "Too small" (an empty title, no questions) is reported in words below; the rest is shape.
    for (const i of parsed.error.issues.filter((x) => x.code !== 'too_small')) {
      out.push({ code: 'schema', message: `${i.path.join('.') || 'course'}: ${i.message}` });
    }
  }
  try {
    out.push(...contentIssues(course, answers));
  } catch {
    // A course too malformed to walk: the schema issues above already say what is wrong.
  }
  return out;
}

function contentIssues(course: Course, answers: AnswerKeys): PublishIssue[] {
  const out: PublishIssue[] = [];
  if (blank(course.title)) out.push({ code: 'course.title', message: 'The course needs a title.' });
  if (blank(course.summary))
    out.push({ code: 'course.summary', message: 'The course needs a one-sentence summary.' });
  const items: Item[] = itemsOf(course);
  if (items.length === 0)
    out.push({ code: 'course.empty', message: 'Add at least one lesson before publishing.' });

  const seen = new Set<string>();
  const dupe = (id: string, itemId?: string) => {
    if (seen.has(id))
      out.push({
        code: 'id.duplicate',
        message: `The id "${id}" is used twice.`,
        ...(itemId ? { itemId } : {}),
      });
    seen.add(id);
  };
  course.parvas.forEach((p) => {
    dupe(p.id);
    if (blank(p.title)) out.push({ code: 'parva.title', message: 'A parva needs a title.' });
  });
  for (const item of items) {
    dupe(item.id, item.id);
    if (blank(item.title))
      out.push({
        code: 'item.title',
        message: 'A lesson or Pariksha needs a title.',
        itemId: item.id,
      });
    if (item.type === 'lesson') {
      if (item.blocks.length === 0)
        out.push({ code: 'lesson.empty', message: 'This lesson is empty.', itemId: item.id });
      for (const b of item.blocks) {
        dupe(b.id, item.id);
        out.push(...blockIssues(item.id, b));
      }
    } else {
      if (item.questions.length === 0)
        out.push({
          code: 'pariksha.empty',
          message: 'A Pariksha needs at least one question.',
          itemId: item.id,
        });
      if (item.questionsShown > item.questions.length) {
        out.push({
          code: 'pariksha.shown',
          message: 'It shows more questions than it has.',
          itemId: item.id,
        });
      }
      for (const q of item.questions) {
        dupe(q.id, item.id);
        out.push(...questionIssues(item.id, q, answers[item.id]?.[q.id]));
      }
    }
  }
  return out;
}

export interface CourseDiff {
  added: string[];
  removed: string[];
  edited: string[];
  /** Course-level fields (title, summary, rules, parva order…) differ. */
  courseChanged: boolean;
}

const stable = (value: unknown): string =>
  JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );

/**
 * What changed between the live course and the draft, by item id. `published` is null for a course
 * that was never published: every item is then "added". Drives "2 unpublished edits" and the
 * publish dialog's summary.
 */
export function diffCourses(published: Course | null, draft: Course): CourseDiff {
  const before = new Map((published ? itemsOf(published) : []).map((i) => [i.id, stable(i)]));
  const after = new Map(itemsOf(draft).map((i) => [i.id, stable(i)]));
  const strip = (c: Course) => ({
    ...c,
    parvas: c.parvas.map((p) => ({ id: p.id, title: p.title, items: p.items.map((i) => i.id) })),
    version: 0,
    publishedAt: null,
    status: 'x',
    estimatedMinutes: 0,
  });
  return {
    added: [...after.keys()].filter((id) => !before.has(id)),
    removed: [...before.keys()].filter((id) => !after.has(id)),
    edited: [...after]
      .filter(([id, json]) => before.has(id) && before.get(id) !== json)
      .map(([id]) => id),
    courseChanged: published === null ? true : stable(strip(published)) !== stable(strip(draft)),
  };
}

/** How many unpublished edits to show: added + removed + edited items, plus one for course-level changes. */
export function countUnpublished(diff: CourseDiff): number {
  return (
    diff.added.length + diff.removed.length + diff.edited.length + (diff.courseChanged ? 1 : 0)
  );
}
