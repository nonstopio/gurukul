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

const fakeDb = (existing: Record<string, unknown> = {}) => {
  const writes: { path: string; data: unknown }[] = [];
  const docs = new Map(Object.entries(existing));
  const db: SeedDb = {
    get: async (path) => docs.get(path),
    set: async (path, data) => {
      docs.set(path, data);
      writes.push({ path, data });
    },
    createIfMissing: async (path, data) => {
      if (docs.has(path)) return false;
      docs.set(path, data);
      writes.push({ path, data });
      return true;
    },
  };
  return { db, writes };
};

const clone = <T>(v: T): T => structuredClone(v);

const COURSE = 'courses/git-the-nonstop-way';
const DRAFT = `${COURSE}/drafts/current`;
const written = (writes: { path: string; data: unknown }[], path: string) =>
  writes.find((w) => w.path === path)?.data as Record<string, unknown> | undefined;

/** A course already live in Firestore, as an Admin and the role grants left it. */
const liveCourse = {
  ...gitCourse,
  version: 3,
  status: 'published',
  educatorIds: ['uid-ravi'],
  educatorNames: { 'uid-ravi': 'Ravi Example' },
  visibility: 'teams',
  visibleTeamIds: ['mobile'],
};

describe('seedCourse', () => {
  it('writes the course, its answer key, version 1 and a draft, stamped with now', async () => {
    const { db, writes } = fakeDb();
    const result = await seedCourse(db, { course: gitCourse, answers: gitAnswers, now });
    expect(result).toEqual({
      coursePath: COURSE,
      answersPath: `${COURSE}/private/answers`,
      draftPath: DRAFT,
      version: 1,
      draft: 'created',
    });
    expect(writes.map((w) => w.path)).toEqual([
      result.coursePath,
      result.answersPath,
      `${COURSE}/versions/1`,
      result.draftPath,
    ]);
    const course = written(writes, COURSE);
    expect(course).toMatchObject({ visibility: 'public', visibleTeamIds: [], version: 1 });
    expect((course as unknown as Course).publishedAt).toBe(now);
    expect(written(writes, result.answersPath)).toEqual(gitAnswers);
    expect(JSON.stringify(course)).not.toContain('"quiz-i-q1":["a"]');
    expect(written(writes, `${COURSE}/versions/1`)).toEqual({
      version: 1,
      publishedAt: now,
      publishedBy: 'seed',
      course,
      answers: gitAnswers,
    });
    expect(written(writes, DRAFT)).toEqual({
      rev: 1,
      updatedAt: now,
      updatedBy: 'seed',
      course: { ...course, visibility: undefined, visibleTeamIds: undefined },
      answers: gitAnswers,
    });
  });

  it('publishes a re-seed as the next version, keeping access and Educators', async () => {
    const { db, writes } = fakeDb({
      [COURSE]: liveCourse,
      [DRAFT]: { rev: 4, updatedBy: 'seed', course: liveCourse, answers: gitAnswers },
    });
    const result = await seedCourse(db, { course: gitCourse, answers: gitAnswers, now });
    expect(result).toMatchObject({ version: 4, draft: 'updated' });
    const course = written(writes, COURSE);
    expect(course).toMatchObject({
      version: 4,
      status: 'published',
      educatorIds: ['uid-ravi'],
      educatorNames: { 'uid-ravi': 'Ravi Example' },
      visibility: 'teams',
      visibleTeamIds: ['mobile'],
    });
    // The content is the seed's: the new worktrees lesson reaches the live course.
    expect(JSON.stringify(course)).toContain('"id":"worktrees"');
    expect(written(writes, `${COURSE}/versions/4`)).toMatchObject({ version: 4, course });
    expect(written(writes, DRAFT)).toMatchObject({
      rev: 5,
      updatedBy: 'seed',
      course: { version: 4, educatorIds: ['uid-ravi'] },
    });
  });

  it('keeps a retired course retired', async () => {
    const { db, writes } = fakeDb({ [COURSE]: { ...liveCourse, status: 'archived' } });
    await seedCourse(db, { course: gitCourse, answers: gitAnswers, now });
    expect(written(writes, COURSE)).toMatchObject({ status: 'archived', version: 4 });
  });

  it('keeps a draft an Educator has edited, so re-seeding never discards Studio work', async () => {
    const { db, writes } = fakeDb({
      [COURSE]: liveCourse,
      [DRAFT]: { rev: 7, updatedBy: 'uid-ravi', course: liveCourse, answers: gitAnswers },
    });
    const result = await seedCourse(db, { course: gitCourse, answers: gitAnswers, now });
    expect(result.draft).toBe('kept');
    expect(writes.map((w) => w.path)).not.toContain(DRAFT);
  });

  it('reads a live course with no version, Educators or access as version 0, none and public', async () => {
    const bare = { ...gitCourse } as Partial<typeof gitCourse>;
    delete bare.version;
    delete bare.educatorIds;
    delete bare.educatorNames;
    const { db, writes } = fakeDb({ [COURSE]: bare, [DRAFT]: { updatedBy: 'seed' } });
    const result = await seedCourse(db, { course: gitCourse, answers: gitAnswers, now });
    expect(result.version).toBe(1);
    expect(written(writes, COURSE)).toMatchObject({
      educatorIds: [],
      educatorNames: {},
      visibility: 'public',
      visibleTeamIds: [],
    });
    expect(written(writes, DRAFT)).toMatchObject({ rev: 1 });
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
