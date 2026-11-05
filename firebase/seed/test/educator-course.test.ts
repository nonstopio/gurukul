import { courseSchema, type Course, type Quiz } from '@gurukul/schema';
import { describe, expect, it } from 'vitest';
import { educatorAnswers, educatorCourse } from '../src/educator-course';
import { answerKeyProblems } from '../src/seed';

const items = educatorCourse.chapters.flatMap((p) => p.items);
const lessons = items.flatMap((i) => (i.type === 'lesson' ? [i] : []));
const quizzes = items.flatMap((i): Quiz[] => (i.type === 'quiz' ? [i] : []));
const now = { toMillis: () => 0, toDate: () => new Date(0) };
const asPublished = (c: Course): Course => ({ ...c, publishedAt: now });

describe('educator course', () => {
  it('parses against the course schema', () => {
    expect(courseSchema.safeParse(asPublished(educatorCourse)).success).toBe(true);
  });

  it('has its identity, rules and certificate', () => {
    expect(educatorCourse).toMatchObject({
      schemaVersion: 4,
      id: 'educator-onboarding',
      title: 'Becoming a Gurukul Educator',
      level: 'foundation',
      status: 'published',
      version: 1,
      publishedAt: null,
      educatorIds: [],
      educatorNames: {},
      rules: { sequential: true, passMark: 0.7, certificate: true, requireVideoWatch: false },
      certificate: { title: 'Gurukul Educator' },
    });
    expect(educatorCourse.cover.theme).not.toBe('forest');
  });

  it('says an Admin assigns it and finishing it makes you an Educator', () => {
    expect(educatorCourse.summary).toMatch(/Admin assigns/);
    expect(educatorCourse.summary).toMatch(/become an Educator/);
    expect(educatorCourse.description).toMatch(/Admin assigns/);
    expect(educatorCourse.description).toMatch(/makes you an Educator/);
  });

  it('has 7 chapters, a 5-question Quiz ending chapter 4 and a Final Quiz ending chapter 7', () => {
    expect(educatorCourse.chapters).toHaveLength(7);
    expect(
      educatorCourse.chapters.map((p) => p.items.filter((i) => i.type === 'quiz').length),
    ).toEqual([0, 0, 0, 1, 0, 0, 1]);
    expect(educatorCourse.chapters[3]?.items.at(-1)).toMatchObject({
      type: 'quiz',
      id: 'quiz-blocks',
    });
    expect(educatorCourse.chapters[6]?.items.at(-1)).toMatchObject({
      type: 'quiz',
      id: 'quiz-final',
    });
    expect(quizzes.map((p) => p.questions.length)).toEqual([5, 10]);
    for (const p of quizzes) {
      expect(p, p.id).toMatchObject({ revealAnswers: 'onPass', cooldownMinutes: 10 });
      expect(new Set(p.questions.map((q) => q.kind)), p.id).toEqual(
        new Set(['single', 'multiple', 'trueFalse']),
      );
    }
  });

  it('sums lesson minutes into estimatedMinutes, about an hour', () => {
    expect(educatorCourse.estimatedMinutes).toBe(lessons.reduce((s, l) => s + l.minutes, 0));
    expect(educatorCourse.estimatedMinutes).toBeGreaterThanOrEqual(55);
    expect(educatorCourse.estimatedMinutes).toBeLessThanOrEqual(90);
  });

  it('ends every lesson with a check, never a copy of a Quiz question', () => {
    const prompts = new Set(quizzes.flatMap((p) => p.questions.map((q) => q.prompt)));
    for (const l of lessons) {
      expect(l.blocks.at(-1)?.type, l.id).toBe('check');
      for (const b of l.blocks) {
        if (b.type === 'check') expect(prompts.has(b.prompt), b.prompt).toBe(false);
      }
    }
  });

  it('uses unique ids for chapters, items, blocks and questions', () => {
    const ids = [
      ...educatorCourse.chapters.map((p) => p.id),
      ...items.map((i) => i.id),
      ...lessons.flatMap((l) => l.blocks.map((b) => b.id)),
      ...quizzes.flatMap((p) => p.questions.map((q) => `${p.id}/${q.id}`)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points every reviewItemId at a lesson in this course', () => {
    const lessonIds = new Set(lessons.map((l) => l.id));
    for (const q of quizzes.flatMap((p) => p.questions)) {
      expect(lessonIds.has(q.reviewItemId ?? ''), q.id).toBe(true);
    }
  });

  it('keeps Quiz answers out of the course object', () => {
    const withoutCheckKeys = JSON.stringify(educatorCourse, (k, v: unknown) =>
      k === 'correct' && typeof v === 'number' ? undefined : v,
    );
    for (const key of ['answer', 'correct', 'answers']) {
      expect(withoutCheckKeys).not.toContain(`"${key}"`);
    }
  });
});

describe('educator answers', () => {
  it('match the course with no problems', () => {
    expect(answerKeyProblems(educatorCourse, educatorAnswers)).toEqual([]);
  });

  it('cover both Quizzes and every question in them', () => {
    expect(Object.keys(educatorAnswers).sort()).toEqual(['quiz-blocks', 'quiz-final']);
    for (const p of quizzes) {
      expect(Object.keys(educatorAnswers[p.id] ?? {}), p.id).toEqual(p.questions.map((q) => q.id));
    }
  });
});
