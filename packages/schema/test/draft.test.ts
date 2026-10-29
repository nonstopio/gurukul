import { describe, expect, it } from 'vitest';
import {
  courseSchema,
  blankCourse,
  countUnpublished,
  diffCourses,
  draftSchema,
  estimateMinutes,
  slugify,
  validateForPublish,
} from '../src';
import type { AnswerKeys, Course } from '../src';
import { firstQuestion, itemAt, makeCourse, chapterAt, ts } from './fixtures';

const keys: AnswerKeys = { q1: { k1: ['a'] } };
const good = () => {
  const c = makeCourse();
  for (const item of c.chapters.flatMap((p) => p.items)) {
    if (item.type === 'lesson' && item.blocks.length === 0) {
      item.blocks = [{ type: 'markdown', id: `${item.id}-b`, md: 'text' }];
    }
  }
  return c;
};
const codes = (c: Course, a: AnswerKeys = keys) => validateForPublish(c, a).map((i) => i.code);

describe('slugify', () => {
  it('makes a hyphenated lower-case slug, dropping accents and edges', () => {
    expect(slugify('  Git, the NonStop Way! ')).toBe('git-the-nonstop-way');
    expect(slugify('Café déjà vu')).toBe('cafe-deja-vu');
    expect(slugify('---')).toBe('');
    expect(slugify('a'.repeat(100) + ' b')).toHaveLength(80);
    expect(slugify(`${'a'.repeat(79)} b`)).toBe('a'.repeat(79));
  });
});

describe('blankCourse and estimateMinutes', () => {
  it('builds a draft course that matches the schema, owned by its creator', () => {
    const c = blankCourse({
      id: 'sql',
      title: 'SQL basics',
      level: 'foundation',
      theme: 'sky',
      educatorId: 'u1',
      educatorName: 'Asha Rao',
    });
    expect(courseSchema.safeParse(c).success).toBe(true);
    expect(c).toMatchObject({
      status: 'draft',
      version: 0,
      educatorIds: ['u1'],
      educatorNames: { u1: 'Asha Rao' },
      cover: { theme: 'sky', glyph: 'S' },
      chapters: [],
    });
    expect(estimateMinutes(c)).toBe(0);
    const unnamed = blankCourse({
      id: 'x',
      title: '  ',
      level: 'advanced',
      theme: 'sand',
      educatorId: 'u',
    });
    expect(unnamed.cover.glyph).toBe('G');
    expect(unnamed.educatorNames).toEqual({});
  });

  it('sums lesson minutes only', () => {
    expect(estimateMinutes(good())).toBe(15);
  });

  it('validates a whole draft document', () => {
    const doc = { rev: 1, updatedAt: ts(1), updatedBy: 'u1', course: good(), answers: keys };
    expect(draftSchema.safeParse(doc).success).toBe(true);
    expect(draftSchema.safeParse({ ...doc, rev: -1 }).success).toBe(false);
  });
});

describe('validateForPublish', () => {
  it('passes a complete course', () => {
    expect(validateForPublish(good(), keys)).toEqual([]);
  });

  it('asks for a title, a summary and some content', () => {
    const c = good();
    c.title = ' ';
    c.summary = '';
    expect(codes(c)).toEqual(expect.arrayContaining(['course.title', 'course.summary']));
    const empty = good();
    empty.chapters = [];
    expect(codes(empty)).toContain('course.empty');
  });

  it('reports structural problems from the schema', () => {
    const c = good();
    (c as { level: string }).level = 'expert';
    expect(validateForPublish(c, keys).find((i) => i.code === 'schema')?.message).toContain(
      'level',
    );
    const whole = good();
    (whole as { title: unknown }).title = 5;
    expect(validateForPublish(whole, keys).every((i) => i.code === 'schema')).toBe(true);
    const root = { ...good(), chapters: 'x' } as unknown as Course;
    expect(
      validateForPublish(root, keys).some(
        (i) => i.code === 'schema' && i.message.startsWith('chapters'),
      ),
    ).toBe(true);
  });

  it('reports a value that is not a course at all, without crashing', () => {
    const issues = validateForPublish(null as unknown as Course, {});
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message.startsWith('course:')).toBe(true);
  });

  it('flags titles, an empty lesson and repeated ids', () => {
    const c = good();
    chapterAt(c, 0).title = '';
    const lesson = itemAt(c, 0);
    lesson.title = '';
    if (lesson.type === 'lesson') lesson.blocks = [];
    expect(codes(c)).toEqual(
      expect.arrayContaining(['chapter.title', 'item.title', 'lesson.empty']),
    );
    const dup = good();
    chapterAt(dup, 0).items.push({ ...itemAt(dup, 0) });
    expect(codes(dup)).toContain('id.duplicate');
    dup.chapters.push({ ...chapterAt(dup, 0) });
    expect(validateForPublish(dup, keys).some((i) => i.code === 'id.duplicate' && !i.itemId)).toBe(
      true,
    );
  });

  const withBlock = (block: unknown) => {
    const c = good();
    const l = itemAt(c, 0);
    if (l.type === 'lesson') l.blocks = [block as never];
    return c;
  };

  it.each([
    [
      { type: 'video', id: 'v', provider: 'youtube', url: 'https://x.test/a', captions: true },
      'block.video.url',
    ],
    [{ type: 'markdown', id: 'm', md: ' ' }, 'block.markdown.empty'],
    [
      { type: 'code', id: 'c', lang: 'sh', code: '', copy: true, terminal: true },
      'block.code.empty',
    ],
    [{ type: 'callout', id: 'k', tone: 'tip', md: '' }, 'block.callout.empty'],
    [{ type: 'image', id: 'i', url: 'https://x.test/a.png', alt: '' }, 'block.image.alt'],
    [{ type: 'embed', id: 'e', url: 'https://evil.test/x', title: 't' }, 'block.embed.host'],
    [{ type: 'file', id: 'f', url: 'https://x.test/a.pdf', label: ' ' }, 'block.file.label'],
    [
      { type: 'check', id: 'h', prompt: '', options: ['a', ' '], explanation: '' },
      'block.check.prompt',
    ],
  ])('flags a bad block: %#', (block, code) => {
    expect(codes(withBlock(block))).toContain(code);
  });

  it('flags every problem of a check block, and accepts good blocks', () => {
    expect(
      codes(
        withBlock({ type: 'check', id: 'h', prompt: '', options: ['a', ' '], explanation: '' }),
      ),
    ).toEqual(
      expect.arrayContaining([
        'block.check.prompt',
        'block.check.options',
        'block.check.correct',
        'block.check.explanation',
      ]),
    );
    for (const ok of [
      {
        type: 'video',
        id: 'v',
        provider: 'youtube',
        url: 'https://youtu.be/abc123',
        captions: true,
      },
      { type: 'markdown', id: 'm', md: 'x' },
      { type: 'code', id: 'c', lang: 'sh', code: 'ls', copy: true, terminal: true },
      { type: 'callout', id: 'k', tone: 'tip', md: 'x' },
      { type: 'image', id: 'i', url: 'https://x.test/a.png', alt: 'a' },
      { type: 'embed', id: 'e', url: 'https://stackblitz.com/edit/x', title: 't' },
      { type: 'file', id: 'f', url: 'https://x.test/a.pdf', label: 'f' },
      { type: 'check', id: 'h', prompt: 'p', options: ['a', 'b'], correct: 1, explanation: 'e' },
    ]) {
      expect(validateForPublish(withBlock(ok), keys), JSON.stringify(ok)).toEqual([]);
    }
  });

  it('wants the marked answer of a check to exist and have text', () => {
    const check = (correct?: number) => ({
      type: 'check',
      id: 'h',
      prompt: 'p',
      options: ['a', 'b', ' '],
      explanation: 'e',
      ...(correct === undefined ? {} : { correct }),
    });
    for (const bad of [undefined, 2, 5]) {
      expect(codes(withBlock(check(bad)))).toContain('block.check.correct');
    }
    expect(codes(withBlock(check(0)))).not.toContain('block.check.correct');
  });

  it('checks every question: text, answers, explanation and the key', () => {
    const c = good();
    const p = itemAt(c, 1);
    if (p.type !== 'quiz') throw new Error('fixture');
    const q = p.questions[0] as unknown as Record<string, unknown>;
    q.prompt = '';
    q.explanation = '';
    q.options = [{ id: 'a', text: '' }];
    expect(codes(c)).toEqual(
      expect.arrayContaining([
        'question.prompt',
        'question.explanation',
        'question.options.count',
        'question.options.empty',
      ]),
    );
    expect(codes(good(), {})).toContain('question.key.missing');
    expect(codes(good(), { q1: { k1: ['zzz'] } })).toContain('question.key.unknown');
    expect(codes(good(), { q1: { k1: ['a', 'b'] } })).toContain('question.key.single');
    const multi = good();
    firstQuestion(multi, 1).kind = 'multiple';
    expect(validateForPublish(multi, { q1: { k1: ['a', 'b'] } })).toEqual([]);
  });

  it('flags an empty Quiz and one that shows too many questions', () => {
    const c = good();
    const p = itemAt(c, 1);
    if (p.type === 'quiz') {
      p.questions = [];
      p.questionsShown = 3;
    }
    expect(codes(c)).toEqual(expect.arrayContaining(['quiz.empty', 'quiz.shown']));
  });
});

describe('diffCourses and countUnpublished', () => {
  it('treats every item as added for a never-published course', () => {
    const d = diffCourses(null, good());
    expect(d.added).toEqual(['l1', 'q1', 'l2', 'l3']);
    expect(d.courseChanged).toBe(true);
    expect(countUnpublished(d)).toBe(5);
  });

  it('finds nothing when nothing changed, whatever the key order', () => {
    const a = good();
    const b = JSON.parse(JSON.stringify(a)) as Course;
    b.version = 9;
    b.estimatedMinutes = 99;
    expect(diffCourses(a, b)).toEqual({ added: [], removed: [], edited: [], courseChanged: false });
    expect(countUnpublished(diffCourses(a, b))).toBe(0);
  });

  it('finds added, removed and edited items, and course-level changes', () => {
    const live = good();
    const draft = JSON.parse(JSON.stringify(live)) as Course;
    const l1 = itemAt(draft, 0);
    l1.title = 'Renamed';
    chapterAt(draft, 0).items.splice(2, 1);
    chapterAt(draft, 0).items.push({ ...itemAt(live, 2), id: 'new' });
    draft.summary = 'Changed';
    const d = diffCourses(live, draft);
    expect(d).toEqual({ added: ['new'], removed: ['l2'], edited: ['l1'], courseChanged: true });
    expect(countUnpublished(d)).toBe(4);
  });

  it('counts a reordered chapter as a course-level change', () => {
    const live = good();
    const draft = JSON.parse(JSON.stringify(live)) as Course;
    chapterAt(draft, 0).items.reverse();
    expect(diffCourses(live, draft).courseChanged).toBe(true);
  });
});
