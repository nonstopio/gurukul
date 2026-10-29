import type { Course } from '@gurukul/schema';
import { describe, expect, it } from 'vitest';
import { gitAnswers, gitCourse } from '../src/git-course';
import {
  answerKeyProblems,
  seedCourse,
  seedOrgConfig,
  type AnswerKeys,
  type SeedDb,
} from '../src/seed';

const now = { toMillis: () => 1_700_000_000_000, toDate: () => new Date(1_700_000_000_000) };

const fakeDb = () => {
  const writes: { path: string; data: unknown }[] = [];
  const db: SeedDb = {
    set: async (path, data) => {
      writes.push({ path, data });
    },
    createIfMissing: async (path, data) => {
      if (writes.some((w) => w.path === path)) return false;
      writes.push({ path, data });
      return true;
    },
  };
  return { db, writes };
};

const clone = <T>(v: T): T => structuredClone(v);

describe('seedCourse', () => {
  it('writes the course and its answer key, stamped with now', async () => {
    const { db, writes } = fakeDb();
    const result = await seedCourse(db, { course: gitCourse, answers: gitAnswers, now });
    expect(result).toEqual({
      coursePath: 'courses/git-the-nonstop-way',
      answersPath: 'courses/git-the-nonstop-way/private/answers',
    });
    expect(writes.map((w) => w.path)).toEqual([result.coursePath, result.answersPath]);
    expect((writes[0]?.data as Course).publishedAt).toBe(now);
    expect(writes[1]?.data).toEqual(gitAnswers);
    expect(JSON.stringify(writes[0]?.data)).not.toContain('"quiz-i-q1":["a"]');
  });

  it('rejects an invalid course and writes nothing', async () => {
    const { db, writes } = fakeDb();
    const bad = { ...clone(gitCourse), id: 'Not A Slug' };
    await expect(seedCourse(db, { course: bad, answers: gitAnswers, now })).rejects.toThrow(
      /Course is invalid:\nid:/,
    );
    expect(writes).toEqual([]);
  });

  it('rejects a bad answer key and writes nothing', async () => {
    const { db, writes } = fakeDb();
    await expect(seedCourse(db, { course: gitCourse, answers: {}, now })).rejects.toThrow(
      /Answer key is invalid:\nquestion "quiz-i\/quiz-i-q1" has no answer key/,
    );
    expect(writes).toEqual([]);
  });
});

describe('answerKeyProblems', () => {
  it('finds none in the real key', () => {
    expect(answerKeyProblems(gitCourse, gitAnswers)).toEqual([]);
  });

  it('reports an unknown quiz, unknown question, missing key, unknown option and wrong count', () => {
    const answers: AnswerKeys = clone(gitAnswers);
    answers['quiz-zzz'] = {};
    const p1 = answers['quiz-i'] as Record<string, string[]>;
    p1['quiz-i-q99'] = ['a'];
    delete p1['quiz-i-q1'];
    p1['quiz-i-q2'] = ['z'];
    p1['quiz-i-q3'] = ['a', 'b'];
    expect(answerKeyProblems(gitCourse, answers)).toEqual([
      'answer key names unknown quiz "quiz-zzz"',
      'answer key names unknown question "quiz-i/quiz-i-q99"',
      'question "quiz-i/quiz-i-q1" has no answer key',
      'answer key for "quiz-i/quiz-i-q2" names unknown option "z"',
      'question "quiz-i/quiz-i-q3" is single and needs exactly one correct option',
    ]);
  });

  it('allows several correct options on a multiple question', () => {
    const answers: AnswerKeys = clone(gitAnswers);
    expect(answers['quiz-final']?.['quiz-final-q3']).toHaveLength(3);
    expect(answerKeyProblems(gitCourse, answers)).toEqual([]);
  });

  it('treats a quiz with no entry at all as every question missing a key', () => {
    const answers: AnswerKeys = clone(gitAnswers);
    delete answers['quiz-ii'];
    expect(answerKeyProblems(gitCourse, answers)).toHaveLength(6);
  });
});

describe('seedOrgConfig', () => {
  it('creates the default org settings once and keeps what is there', async () => {
    const { db, writes } = fakeDb();
    expect(await seedOrgConfig(db)).toEqual({ path: 'config/org', created: true });
    expect(writes).toEqual([
      {
        path: 'config/org',
        data: {
          domain: 'nonstopio.com',
          teams: [],
          reminders: { enabled: false },
          signatory: { name: 'Asha Example', role: 'Head of NonStop Academy' },
        },
      },
    ]);
    expect(await seedOrgConfig(db)).toEqual({ path: 'config/org', created: false });
    expect(writes).toHaveLength(1);
  });
});
