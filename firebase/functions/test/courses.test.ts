import { ERROR_CODES, apiFail, apiOk, apiResponseSchema } from '@gurukul/schema';
import type { AnswerKeys, Course, ApiException } from '@gurukul/schema';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { z } from 'zod';
import {
  archiveCourse,
  createCourse,
  publishCourse,
  restrictAnswers,
  rollbackCourse,
} from '../src/courses.js';
import type {
  CourseStore,
  DraftData,
  LiveCourse,
  ReleasePlan,
  ReleaseState,
  VersionData,
} from '../src/courses.js';
import type * as Schema from '@gurukul/schema';
import { answerKey, course } from './fixtures.js';

// Calls through; a test swaps in one upgrade to see publish and rollback use what it returns.
const upgrade = vi.hoisted(() => ({ fn: vi.fn<(raw: unknown) => unknown>() }));
vi.mock('@gurukul/schema', async (actual) => {
  const schema = await actual<typeof Schema>();
  upgrade.fn.mockImplementation((raw) => schema.upgradeCourse(raw));
  return { ...schema, upgradeCourse: upgrade.fn };
});
const upgradeOnce = (title: string) =>
  upgrade.fn.mockImplementationOnce((raw) => ({ ...(raw as object), title }));

const envelope = apiResponseSchema(z.unknown());
const parses = (e: ApiException) => envelope.parse(apiFail([e], 'trace'));

const asha = { uid: 'asha', email: 'asha@nonstopio.com', claims: { acharya: true } };
const rohan = { uid: 'rohan', email: 'rohan@nonstopio.com', claims: { acharya: true } };
const ajay = { uid: 'ajay', email: 'ajay@nonstopio.com', claims: { kulapati: true } };
const priya = { uid: 'priya', email: 'priya@nonstopio.com', claims: {} };

const validCourse = (over: object = {}) =>
  course({}, { summary: 'Learn git', acharyaIds: ['asha'], ...over }) as unknown as Course;
const draftOf = (over: Partial<DraftData> = {}): DraftData => ({
  rev: 4,
  course: validCourse({ title: 'Draft title', acharyaIds: ['intruder'] }),
  answers: answerKey,
  ...over,
});

interface Fake {
  store: CourseStore;
  created: Parameters<CourseStore['create']>[0][];
  plans: { plan: ReleasePlan; uid: string }[];
  audits: unknown[];
  setStatus: Mock<CourseStore['setStatus']>;
}
function fake(state: Partial<ReleaseState> & { drafts?: boolean; taken?: boolean } = {}): Fake {
  const live: LiveCourse | undefined =
    'live' in state ? state.live : { version: 2, status: 'published', acharyaIds: ['asha'] };
  const draft = 'draft' in state ? state.draft : draftOf();
  const out: Fake = {
    created: [],
    plans: [],
    audits: [],
    setStatus: vi.fn<CourseStore['setStatus']>().mockResolvedValue(undefined),
    store: undefined as never,
  };
  out.store = {
    getLive: vi.fn().mockResolvedValue(live),
    getDraft: vi.fn().mockResolvedValue(draft),
    create: vi.fn(async (plan) => {
      out.created.push(plan);
      return state.taken !== true;
    }),
    release: vi.fn(async (_id, uid, _load, decide) => {
      const plan = decide({ live, draft, snapshot: state.snapshot });
      out.plans.push({ plan, uid });
      return plan.version;
    }),
    setStatus: out.setStatus,
    audit: vi.fn(async (e) => void out.audits.push(e)),
  };
  return out;
}

const request = { title: 'Git basics', slug: 'git-basics', level: 'foundation', theme: 'forest' };

describe('createCourse', () => {
  it('creates a blank course owned by the caller and audits it', async () => {
    const f = fake();
    const data = await createCourse(f.store, asha, request);
    expect(envelope.parse(apiOk(data))).toMatchObject({
      success: true,
      data: { courseId: 'git-basics' },
    });
    expect(f.created[0]).toMatchObject({
      courseId: 'git-basics',
      uid: 'asha',
      course: { id: 'git-basics', status: 'draft', version: 0, acharyaIds: ['asha'] },
      draft: { answers: {}, course: { title: 'Git basics', acharyaIds: ['asha'] } },
    });
    expect(f.audits).toEqual([
      { action: 'course.create', by: 'asha', target: 'git-basics', detail: {} },
    ]);
  });

  it('lets a Kulapati create too, and treats a null duplicateFrom as none', async () => {
    const f = fake();
    await createCourse(f.store, ajay, { ...request, duplicateFrom: null });
    expect(f.store.getLive).not.toHaveBeenCalled();
    expect(f.created).toHaveLength(1);
  });

  it('refuses a learner', async () => {
    const f = fake();
    const e = await createCourse(f.store, priya, request).catch((x: ApiException) => x);
    expect(parses(e as ApiException).errors[0]?.code).toBe('AUTH_2001');
    expect(f.created).toHaveLength(0);
  });

  it.each([
    [{ ...request, title: undefined }, 'VAL_1001', 'title'],
    [{ ...request, title: '' }, 'VAL_1002', 'title'],
    [{ ...request, title: 'x'.repeat(161) }, 'VAL_1002', 'title'],
    [{ ...request, slug: 'Bad Slug' }, 'VAL_1002', 'slug'],
    [{ ...request, slug: undefined }, 'VAL_1001', 'slug'],
    [{ ...request, level: 'expert' }, 'VAL_1002', 'level'],
    [{ ...request, theme: 'neon' }, 'VAL_1002', 'theme'],
    [{ ...request, duplicateFrom: 'a/b' }, 'VAL_1002', 'duplicateFrom'],
  ])('rejects a malformed request %j', async (bad, code, fieldName) => {
    await expect(createCourse(fake().store, asha, bad)).rejects.toMatchObject({
      code,
      details: { field: fieldName },
    });
  });

  it('says CRS_1002 when the slug is taken', async () => {
    const f = fake({ taken: true });
    const e = (await createCourse(f.store, asha, request).catch((x: unknown) => x)) as ApiException;
    expect(e.code).toBe('CRS_1002');
    expect(parses(e)).toMatchObject({ status: 409, errors: [{ retryable: false }] });
    expect(f.audits).toEqual([]);
  });

  it('copies the source draft, answers included, under the new identity', async () => {
    const f = fake({
      draft: draftOf({ course: validCourse({ status: 'published', version: 5, summary: 'kept' }) }),
    });
    await createCourse(f.store, asha, { ...request, duplicateFrom: 'old' });
    const { draft, course: live } = f.created[0] as never as { draft: DraftData; course: Course };
    expect(draft.answers).toEqual(answerKey);
    expect(draft.course).toMatchObject({
      id: 'git-basics',
      title: 'Git basics',
      acharyaIds: ['asha'],
      status: 'draft',
      version: 0,
      publishedAt: null,
      summary: 'kept',
    });
    expect(live.parvas).toEqual([]);
    expect(f.audits).toEqual([
      {
        action: 'course.create',
        by: 'asha',
        target: 'git-basics',
        detail: { duplicateFrom: 'old' },
      },
    ]);
  });

  it('lets a Kulapati copy any course but not an Acharya of another one', async () => {
    await expect(
      createCourse(fake().store, ajay, { ...request, duplicateFrom: 'old' }),
    ).resolves.toBeDefined();
    await expect(
      createCourse(fake().store, rohan, { ...request, duplicateFrom: 'old' }),
    ).rejects.toMatchObject({
      code: 'AUTH_2001',
    });
  });

  it('says CRS_2001 when the source or its draft is missing', async () => {
    await expect(
      createCourse(fake({ live: undefined }).store, asha, { ...request, duplicateFrom: 'old' }),
    ).rejects.toMatchObject({ code: 'CRS_2001', params: ['old'] });
    await expect(
      createCourse(fake({ draft: undefined }).store, asha, { ...request, duplicateFrom: 'old' }),
    ).rejects.toMatchObject({ code: 'CRS_2001' });
  });
});

describe('restrictAnswers', () => {
  it('drops keys of questions and Parikshas that no longer exist', () => {
    const answers: AnswerKeys = { pk: { ...answerKey.pk, gone: ['a'] }, ghost: { q: ['a'] } };
    expect(restrictAnswers(validCourse(), answers)).toEqual(answerKey);
  });
  it('ignores lessons', () => {
    const lesson = { type: 'lesson', id: 'l1', title: 'L', minutes: 5, blocks: [] };
    const base = validCourse();
    const withLesson = { ...base, parvas: [{ id: 'p', title: 'P', items: [lesson] }] } as never;
    expect(restrictAnswers(withLesson, answerKey)).toEqual({});
  });
  it('keeps a Pariksha with no answers as an empty entry', () => {
    expect(restrictAnswers(validCourse(), {})).toEqual({ pk: {} });
  });
});

describe('publishCourse', () => {
  it('publishes the draft as the next version, with the live Acharyas and restricted answers', async () => {
    const f = fake({ draft: draftOf({ answers: { pk: { ...answerKey.pk, stale: ['a'] } } }) });
    const data = await publishCourse(f.store, asha, { courseId: 'git-basics' });
    expect(envelope.parse(apiOk(data)).data).toEqual({ version: 3 });
    const [{ plan, uid }] = f.plans as [Fake['plans'][number]];
    expect(uid).toBe('asha');
    expect(plan.course).toMatchObject({
      id: 'git-basics',
      title: 'Draft title',
      status: 'published',
      version: 3,
      acharyaIds: ['asha'],
      estimatedMinutes: 0,
    });
    expect(plan.answers).toEqual(answerKey);
    expect(plan.resetDraft).toBeUndefined();
    expect(f.audits).toEqual([
      { action: 'course.publish', by: 'asha', target: 'git-basics', detail: { version: 3 } },
    ]);
  });

  it('upgrades a draft saved at an older schemaVersion before validating and publishing it', async () => {
    upgradeOnce('Upgraded title');
    const f = fake();
    await publishCourse(f.store, asha, { courseId: 'git-basics' });
    expect(upgrade.fn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Draft title' }));
    expect(f.plans[0]?.plan.course.title).toBe('Upgraded title');
  });

  it('lets a Kulapati publish any course', async () => {
    await expect(publishCourse(fake().store, ajay, { courseId: 'c' })).resolves.toEqual({
      version: 3,
    });
  });

  it('refuses an invalid draft with CRS_1003 and the full issue list', async () => {
    const f = fake({ draft: draftOf({ course: validCourse({ summary: '' }), answers: {} }) });
    const e = (await publishCourse(f.store, asha, { courseId: 'c' }).catch(
      (x: unknown) => x,
    )) as ApiException;
    expect(e.code).toBe('CRS_1003');
    const issues = e.details['issues'] as { code: string }[];
    expect(issues.map((i) => i.code)).toContain('course.summary');
    expect(issues.map((i) => i.code)).toContain('question.key.missing');
    expect(parses(e)).toMatchObject({ status: 400, errors: [{ details: { issues } }] });
    expect(f.audits).toEqual([]);
  });

  it('refuses non-editors, a missing course and a missing draft', async () => {
    await expect(publishCourse(fake().store, rohan, { courseId: 'c' })).rejects.toMatchObject({
      code: 'AUTH_2001',
    });
    await expect(
      publishCourse(fake({ live: undefined }).store, asha, { courseId: 'c' }),
    ).rejects.toMatchObject({
      code: 'CRS_2001',
    });
    await expect(
      publishCourse(fake({ draft: undefined }).store, asha, { courseId: 'c' }),
    ).rejects.toMatchObject({
      code: 'CRS_2001',
    });
    await expect(publishCourse(fake().store, asha, {})).rejects.toMatchObject({ code: 'VAL_1001' });
  });
});

describe('rollbackCourse', () => {
  const snapshot: VersionData = {
    course: validCourse({ title: 'Old title', version: 1, acharyaIds: ['gone'] }),
    answers: answerKey,
  };

  it('publishes the snapshot as a new version and resets the draft to it', async () => {
    const f = fake({ snapshot });
    const data = await rollbackCourse(f.store, asha, { courseId: 'git-basics', version: 1 });
    expect(envelope.parse(apiOk(data)).data).toEqual({ version: 3 });
    const [{ plan }] = f.plans as [Fake['plans'][number]];
    expect(plan.course).toMatchObject({
      title: 'Old title',
      status: 'published',
      version: 3,
      acharyaIds: ['asha'],
    });
    expect(plan.answers).toEqual(answerKey);
    expect(plan.resetDraft).toEqual({ rev: 5, course: snapshot.course, answers: answerKey });
    expect(f.audits).toEqual([
      {
        action: 'course.rollback',
        by: 'asha',
        target: 'git-basics',
        detail: { restoredVersion: 1, version: 3 },
      },
    ]);
  });

  it('republishes an old snapshot in the current shape and resets the draft to it', async () => {
    upgradeOnce('Upgraded old title');
    const f = fake({ snapshot });
    await rollbackCourse(f.store, asha, { courseId: 'git-basics', version: 1 });
    const plan = f.plans[0]?.plan;
    expect(plan?.course.title).toBe('Upgraded old title');
    expect(plan?.resetDraft?.course.title).toBe('Upgraded old title');
  });

  it('starts the draft at rev 1 when there was none', async () => {
    const f = fake({ snapshot, draft: undefined });
    await rollbackCourse(f.store, ajay, { courseId: 'c', version: 2 });
    expect(f.plans[0]?.plan.resetDraft?.rev).toBe(1);
  });

  it('says CRS_2002 for an unknown version', async () => {
    const e = (await rollbackCourse(fake().store, asha, { courseId: 'c', version: 9 }).catch(
      (x: unknown) => x,
    )) as ApiException;
    expect(e).toMatchObject({ code: 'CRS_2002', params: ['c', '9'] });
    expect(parses(e).status).toBe(404);
  });

  it('refuses non-editors and a missing course', async () => {
    await expect(
      rollbackCourse(fake({ snapshot }).store, rohan, { courseId: 'c', version: 1 }),
    ).rejects.toMatchObject({
      code: 'AUTH_2001',
    });
    await expect(
      rollbackCourse(fake({ live: undefined }).store, asha, { courseId: 'c', version: 1 }),
    ).rejects.toMatchObject({ code: 'CRS_2001' });
  });

  it.each([
    [undefined, 'VAL_1001'],
    ['1', 'VAL_1002'],
    [0, 'VAL_1002'],
    [1.5, 'VAL_1002'],
  ])('rejects version %j', async (version, code) => {
    await expect(
      rollbackCourse(fake().store, asha, { courseId: 'c', version }),
    ).rejects.toMatchObject({
      code,
      details: { field: 'version' },
    });
  });
});

describe('archiveCourse', () => {
  it('archives and restores, and audits', async () => {
    const f = fake();
    expect(await archiveCourse(f.store, ajay, { courseId: 'c', archived: true })).toEqual({
      status: 'archived',
    });
    expect(f.setStatus).toHaveBeenLastCalledWith('c', 'archived');
    const out = await archiveCourse(f.store, ajay, { courseId: 'c', archived: false });
    expect(envelope.parse(apiOk(out)).data).toEqual({ status: 'published' });
    expect(f.audits).toEqual([
      { action: 'course.archive', by: 'ajay', target: 'c', detail: { status: 'archived' } },
      { action: 'course.archive', by: 'ajay', target: 'c', detail: { status: 'published' } },
    ]);
  });

  it('refuses an Acharya', async () => {
    const f = fake();
    await expect(
      archiveCourse(f.store, asha, { courseId: 'c', archived: true }),
    ).rejects.toMatchObject({
      code: 'AUTH_2001',
    });
    expect(f.setStatus).not.toHaveBeenCalled();
  });

  it('says CRS_2001 for a missing course and CRS_1001 when restoring a never-published one', async () => {
    await expect(
      archiveCourse(fake({ live: undefined }).store, ajay, { courseId: 'c', archived: true }),
    ).rejects.toMatchObject({ code: 'CRS_2001' });
    const never = fake({ live: { version: 0, status: 'draft', acharyaIds: [] } });
    const e = (await archiveCourse(never.store, ajay, { courseId: 'c', archived: false }).catch(
      (x: unknown) => x,
    )) as ApiException;
    expect(e.code).toBe('CRS_1001');
    expect(never.setStatus).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 'VAL_1001'],
    ['yes', 'VAL_1002'],
  ])('rejects archived %j', async (archived, code) => {
    await expect(
      archiveCourse(fake().store, ajay, { courseId: 'c', archived }),
    ).rejects.toMatchObject({
      code,
      details: { field: 'archived' },
    });
  });
});

describe('catalog', () => {
  it('has the course codes the Studio relies on', () => {
    expect(ERROR_CODES.CRS_1002.status).toBe(409);
    expect(ERROR_CODES.CRS_1003.status).toBe(400);
    expect(ERROR_CODES.CRS_2002.status).toBe(404);
  });
});
