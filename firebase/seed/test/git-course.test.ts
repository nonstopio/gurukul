import { courseSchema, type Course, type Quiz } from '@gurukul/schema';
import { describe, expect, it } from 'vitest';
import { gitAnswers, gitCourse } from '../src/git-course';

const items = gitCourse.chapters.flatMap((p) => p.items);
const lessons = items.flatMap((i) => (i.type === 'lesson' ? [i] : []));
const quizzes = items.flatMap((i): Quiz[] => (i.type === 'quiz' ? [i] : []));
const now = { toMillis: () => 0, toDate: () => new Date(0) };
const asPublished = (c: Course): Course => ({ ...c, publishedAt: now });

describe('git course', () => {
  it('parses against the course schema', () => {
    expect(courseSchema.safeParse(asPublished(gitCourse)).success).toBe(true);
  });

  it('has the planned rules and identity', () => {
    expect(gitCourse).toMatchObject({
      id: 'git-the-nonstop-way',
      level: 'foundation',
      status: 'published',
      version: 1,
      educatorIds: [],
      rules: { sequential: true, passMark: 0.7, certificate: true },
    });
  });

  it('has 6 chapters, 22 lessons and 3 Quizzes of 6, 6 and 8 questions', () => {
    expect(gitCourse.chapters).toHaveLength(6);
    expect(lessons).toHaveLength(22);
    expect(quizzes.map((p) => p.questions.length)).toEqual([6, 6, 8]);
  });

  it('places the Quizzes after chapters 2, 3 and 6, as the last item', () => {
    const where = gitCourse.chapters.flatMap((p, n) =>
      p.items.at(-1)?.type === 'quiz' ? [n + 1] : [],
    );
    expect(where).toEqual([2, 3, 6]);
    expect(gitCourse.chapters.map((p) => p.items.filter((i) => i.type === 'quiz').length)).toEqual([
      0, 1, 1, 0, 0, 1,
    ]);
  });

  it('sums lesson minutes into estimatedMinutes', () => {
    expect(gitCourse.estimatedMinutes).toBe(lessons.reduce((s, l) => s + l.minutes, 0));
  });

  it('matches the outline: 3 h 10 of lessons, a 10 minute cooldown on Quiz I and II', () => {
    expect(gitCourse.estimatedMinutes).toBe(190);
    expect(quizzes.slice(0, 2).map((p) => p.cooldownMinutes)).toEqual([10, 10]);
  });

  it('uses unique ids for chapters, items, blocks and questions', () => {
    const ids = [
      ...gitCourse.chapters.map((p) => p.id),
      ...items.map((i) => i.id),
      ...lessons.flatMap((l) => l.blocks.map((b) => b.id)),
      ...quizzes.flatMap((p) => p.questions.map((q) => q.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points every reviewItemId at an existing lesson', () => {
    const lessonIds = new Set(lessons.map((l) => l.id));
    for (const q of quizzes.flatMap((p) => p.questions)) {
      expect(lessonIds.has(q.reviewItemId ?? '')).toBe(true);
    }
  });

  it('gives every question 2-4 options with explanation', () => {
    for (const q of quizzes.flatMap((p) => p.questions)) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(4);
      expect(q.explanation.length).toBeGreaterThan(0);
    }
  });

  it('uses video blocks only in the two video lessons, with the placeholder URL', () => {
    const withVideo = lessons.filter((l) => l.blocks.some((b) => b.type === 'video'));
    expect(withVideo.map((l) => l.id)).toEqual(['what-git-solves', 'your-first-repository']);
    for (const l of withVideo) {
      expect(l.completeWhen).toBe('video90');
      expect(l.layout).toBe('split');
    }
  });

  it('stays well under 100 KB and keeps answers out of the course object', () => {
    const json = JSON.stringify(gitCourse);
    expect(json.length).toBeLessThan(100_000);
    // An ungraded check carries its own right answer; Quiz keys are the secret ones.
    const checks = lessons.flatMap((l) => l.blocks.filter((b) => b.type === 'check'));
    expect(checks.length).toBeGreaterThan(0);
    for (const c of checks) expect(c.correct).toBeLessThan(c.options.length);
    const withoutCheckKeys = JSON.stringify(gitCourse, (k, v: unknown) =>
      k === 'correct' && typeof v === 'number' ? undefined : v,
    );
    for (const key of ['answer', 'correct', 'answers']) {
      expect(withoutCheckKeys).not.toContain(`"${key}"`);
    }
  });
});

describe('git answers', () => {
  it('has a key for every question and no extras', () => {
    expect(Object.keys(gitAnswers)).toEqual(quizzes.map((p) => p.id));
    for (const p of quizzes) {
      expect(Object.keys(gitAnswers[p.id] ?? {}).sort()).toEqual(
        p.questions.map((q) => q.id).sort(),
      );
    }
  });

  it('names existing options, exactly one for single, trueFalse and codeOutput', () => {
    for (const p of quizzes) {
      for (const q of p.questions) {
        const key = gitAnswers[p.id]?.[q.id] ?? [];
        const optionIds = q.options.map((o) => o.id);
        expect(key.length).toBeGreaterThan(0);
        for (const id of key) expect(optionIds).toContain(id);
        if (q.kind !== 'multiple') expect(key).toHaveLength(1);
      }
    }
  });

  it('answers the six planned Quiz II questions', () => {
    const p2 = quizzes[1] as Quiz;
    const correctText = p2.questions.map((q) => {
      const id = gitAnswers['quiz-ii']?.[q.id]?.[0];
      return q.options.find((o) => o.id === id)?.text;
    });
    expect(correctText).toEqual([
      'A movable pointer to a commit',
      'git switch -c feature/x',
      'Pauses and writes both versions into the file with conflict markers',
      'When the target branch has no new commits since your branch was created',
      '`git add <file>` then `git commit`',
      'The branch you have checked out',
    ]);
  });
});
