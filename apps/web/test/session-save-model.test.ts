import { describe, expect, it, vi } from 'vitest';
import { blankCourse } from '@gurukul/schema';
import type { Chapter, Course, Lesson } from '@gurukul/schema';
import { courseChanges } from '@gurukul/schema/changes';
import type { MergeConflict } from '@gurukul/schema/merge';
import { DraftConflictError } from '../src/studio/errors';
import { numbersOf } from '../src/studio/session/review';
import {
  baseOfDraft,
  bringInDraft,
  bringInSummary,
  busyWaits,
  CREATED_CLOCK_SKEW_MS,
  conflictName,
  conflictReason,
  conflictRows,
  draftCheck,
  draftCheckLine,
  mergeSides,
  mergeWithDraft,
  movedLine,
  orderLine,
  ownCreatedBase,
  saveFailure,
  saveSession,
  saveWaits,
  savedWhen,
  saverName,
  workOfDraft,
} from '../src/studio/session/save';
import type { DraftCheck } from '../src/studio/session/save';
import type { Working } from '../src/studio/types';
import { lesson, makeCourse } from './fake-data';
import { draftDoc } from './fake-studio';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
const { log } = await import('../src/log');

const BASE: Working = { course: makeCourse(), answers: { q1: { k1: ['a'] } } };
const change = (w: Working, edit: (c: Course, a: Working['answers']) => void): Working => {
  const next = structuredClone(w);
  edit(next.course, next.answers);
  return next;
};
const chapter = (c: Course, id: string) => c.chapters.find((x) => x.id === id) as Chapter;

describe('the stored draft against the base', () => {
  const stored = draftDoc(makeCourse(), { rev: 4 });
  const open = { status: 'open' as const, base: { rev: 4, savedAt: null, work: BASE } };

  it('knows nothing for a closed session or a new course, then checks, fails, matches or moved', () => {
    expect(draftCheck({ ...open, status: 'saved' }, null)).toEqual({
      state: 'none',
      why: 'closed',
    });
    expect(draftCheck({ ...open, base: null }, null)).toEqual({ state: 'none', why: 'new' });
    expect(draftCheck(open, null)).toEqual({ state: 'checking' });
    expect(draftCheck(open, { state: 'checking' })).toEqual({ state: 'checking' });
    expect(draftCheck(open, { state: 'failed' })).toEqual({ state: 'failed' });
    expect(draftCheck(open, { state: 'read', stored })).toEqual({ state: 'current', stored });
    const moved = { ...stored, rev: 5 };
    expect(draftCheck(open, { state: 'read', stored: moved })).toEqual({
      state: 'moved',
      stored: moved,
    });
  });

  it('names who saved it and when', () => {
    const doc = draftDoc(makeCourse({ educatorNames: { u2: 'Arjun', u3: ' ' } }), {
      updatedBy: 'u2',
      updatedAt: new Date('2026-11-18T08:40:00Z'),
    });
    expect(saverName(doc, 'u1')).toBe('Arjun');
    expect(saverName(doc, 'u2')).toBe('you');
    expect(saverName({ ...doc, updatedBy: 'u3' }, 'u1')).toBe('someone else');
    expect(saverName({ ...doc, updatedBy: 'admin' }, 'u1')).toBe('someone else');
    const at = doc.updatedAt as Date;
    const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const day = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    expect(savedWhen(at, new Date(at.getTime() + 60_000))).toBe(`at ${time}`);
    expect(savedWhen(at, new Date(at.getTime() + 3 * 86_400_000))).toBe(`on ${day} at ${time}`);
    expect(savedWhen(null, at)).toBeNull();
    expect(movedLine(doc, 'u1', at)).toBe(
      `The draft was saved by Arjun at ${time}, after this session started.`,
    );
    expect(movedLine({ ...doc, updatedAt: null }, 'u1', at)).toBe(
      'The draft was saved by Arjun after this session started.',
    );
  });

  it('says each state of the check in words, with its sign', () => {
    const line = (check: DraftCheck) => draftCheckLine(check);
    expect(line({ state: 'none', why: 'new' })).toEqual({
      state: 'info',
      title: 'Draft is up to date: a new course has no draft yet',
    });
    expect(line({ state: 'none', why: 'closed' }).title).toBe(
      'Draft is up to date: not checked once a session is closed',
    );
    expect(line({ state: 'checking' })).toEqual({
      state: 'info',
      title: 'Draft is up to date: checking…',
    });
    expect(line({ state: 'failed' })).toEqual({
      state: 'warn',
      title: 'Draft is up to date: could not be checked',
    });
    expect(line({ state: 'current', stored })).toEqual({
      state: 'pass',
      title: 'Draft is up to date',
    });
    expect(line({ state: 'moved', stored })).toEqual({
      state: 'fail',
      title: 'The draft moved since this session started · stops Save',
    });
  });
});

describe('why Save waits', () => {
  const ready = { status: 'ready' as const, canSave: true, saving: false, handEdits: null };
  const current: DraftCheck = { state: 'current', stored: draftDoc(makeCourse()) };

  it('names the first thing in the way, or nothing', () => {
    expect(saveWaits(ready, current, [], 3)).toBeNull();
    expect(saveWaits({ ...ready, saving: true, canSave: false }, current, [], 3)).toBeNull();
    expect(saveWaits(ready, current, ['Course is valid', 'Size'], 3)).toMatch(
      /^The course is not valid yet/,
    );
    expect(saveWaits(ready, current, ['Size'], 3)).toBe(
      'The course is over the size limit. Make it smaller first.',
    );
    expect(saveWaits(ready, { state: 'moved', stored: draftDoc(makeCourse()) }, [], 3)).toBe(
      'Bring in their changes first.',
    );
    expect(saveWaits(ready, current, [], 0)).toBe('Nothing has changed yet.');
    const busy = { ...ready, canSave: false };
    expect(
      saveWaits({ ...busy, handEdits: { state: 'dirty', savedAt: null } }, current, [], 1),
    ).toBe('Leave the editor first: its edits become a turn then.');
    expect(saveWaits({ ...busy, status: 'connecting' }, current, [], 1)).toBe(
      'Wait while the agent starts.',
    );
    expect(saveWaits({ ...busy, status: 'undoing' }, current, [], 1)).toBe(
      'Wait while the last change is written.',
    );
    expect(saveWaits({ ...busy, status: 'editing' }, current, [], 1)).toBe(
      'Wait while the last change is written.',
    );
    expect(saveWaits({ ...busy, status: 'working' }, current, [], 1)).toBe(
      'Wait for the agent to finish this turn.',
    );
  });

  it('says why Bring in their changes waits, naming the real reason', () => {
    const busy = { ...ready, canSave: false };
    expect(busyWaits(ready)).toBeNull();
    expect(busyWaits({ ...busy, handEdits: { state: 'saved', savedAt: null } })).toBe(
      'Leave the editor first: its edits become a turn then.',
    );
    expect(busyWaits({ ...busy, status: 'connecting' })).toBe('Wait while the agent starts.');
    expect(busyWaits({ ...busy, status: 'undoing' })).toBe(
      'Wait while the last change is written.',
    );
    // A save or another merge being written.
    expect(busyWaits({ ...busy, saving: true })).toBe('Wait while the last change is written.');
    expect(busyWaits({ ...busy, status: 'working' })).toBe(
      'Wait for the agent to finish this turn.',
    );
  });

  it('says why a save failed in plain words, never the error’s own text', () => {
    expect(saveFailure({ code: 'permission-denied' })).toMatch(/^Gurukul refused the save/);
    expect(saveFailure({ code: 'unavailable' })).toMatch(/^Gurukul could not reach the server/);
    expect(saveFailure({ code: 'deadline-exceeded' })).toMatch(/could not reach the server/);
    expect(saveFailure(new Error('internal: secret detail'))).toBe(
      'The draft could not be saved. Try again; the session is kept on this computer.',
    );
    expect(saveFailure(null)).toMatch(/^The draft could not be saved/);
  });
});

describe('a new course found at the address the session tried (DSK-28)', () => {
  const note = { slug: 'code-review', title: 'Code review', since: '2026-11-19T10:00:00.000Z' };
  /** The draft `createCourse` writes, made just after the note. */
  const made = (edit: (c: Course) => void = () => undefined, over = {}) => {
    const course = blankCourse({
      id: 'code-review',
      title: 'Code review, renamed',
      level: 'advanced',
      theme: 'sky',
      educatorId: 'u1',
      educatorName: 'Priya N',
    });
    edit(course);
    return draftDoc(course, {
      rev: 1,
      updatedBy: 'u1',
      updatedAt: new Date('2026-11-19T10:00:02.000Z'),
      ...over,
    });
  };

  it('is the session’s base when it is the blank course this person’s attempt made', () => {
    const stored = made();
    expect(ownCreatedBase(stored, note, 'u1')).toEqual(baseOfDraft(stored));
    // The server's clock may be a little behind the laptop's; a date it does not give is no proof.
    expect(
      ownCreatedBase(
        made(undefined, {
          updatedAt: new Date(Date.parse(note.since) - CREATED_CLOCK_SKEW_MS + 1000),
        }),
        note,
        'u1',
      ),
    ).not.toBeNull();
    expect(ownCreatedBase(made(undefined, { updatedAt: null }), note, 'u1')).not.toBeNull();
  });

  it.each([
    ['at another address', made(), { ...note, slug: 'code-review-2' }],
    ['saved again since', made(undefined, { rev: 2 }), note],
    ['saved by someone else', made(undefined, { updatedBy: 'u2' }), note],
    ['with another Educator', made((c) => (c.educatorIds = ['u1', 'u2'])), note],
    ['someone else’s', made((c) => (c.educatorIds = ['u2'])), note],
    ['published', made((c) => (c.version = 1)), note],
    ['live', made((c) => (c.status = 'published')), note],
    [
      'with a publish date',
      made((c) => (c.publishedAt = { toMillis: () => 0, toDate: () => new Date(0) })),
      note,
    ],
    ['with answer keys', made(undefined, { answers: { q: {} } }), note],
    ['with answers marked changed', made(undefined, { answersChanged: true as const }), note],
    ['no longer blank', made((c) => (c.description = 'Written in the browser.')), note],
    ['with a chapter', made((c) => c.chapters.push({ id: 'p1', title: 'One', items: [] })), note],
    [
      'made before the attempt',
      made(undefined, {
        updatedAt: new Date(Date.parse(note.since) - CREATED_CLOCK_SKEW_MS - 1000),
      }),
      note,
    ],
  ])('is not when the course there is %s', (_why, stored, tried) => {
    expect(ownCreatedBase(stored, tried, 'u1')).toBeNull();
  });
});

describe('saving a session through Studio’s save', () => {
  const ids = { uid: 'u1', sessionId: 's1', courseId: 'git' };
  const data = (over: Partial<Parameters<typeof saveSession>[1]> = {}) => ({
    saveDraft: vi.fn(async (_c: string, _w: Working, rev: number) => rev + 1),
    getDraft: vi.fn(async () => draftDoc(makeCourse(), { rev: 9 })),
    ...over,
  });

  it('hands the runtime Studio’s saveDraft for this course and person', async () => {
    const d = data();
    const agent = {
      saveToDraft: vi.fn(async (write: (w: Working, rev: number) => Promise<number>) => ({
        ok: true as const,
        rev: await write(BASE, 4),
        kept: true,
      })),
    };
    expect(await saveSession(agent, d, ids)).toEqual({ status: 'saved', rev: 5, kept: true });
    expect(d.saveDraft).toHaveBeenCalledWith('git', BASE, 4, 'u1');
    expect(d.getDraft).not.toHaveBeenCalled();
  });

  it('passes on a refusal, reads the draft again on a conflict, and logs any other failure once', async () => {
    const refused = {
      saveToDraft: vi.fn(async () => ({ ok: false as const, reason: 'busy' as const })),
    };
    expect(await saveSession(refused, data(), ids)).toEqual({ status: 'refused', reason: 'busy' });

    const conflict = new DraftConflictError();
    const moved = {
      saveToDraft: vi.fn(async () => ({
        ok: false as const,
        reason: 'error' as const,
        error: conflict,
      })),
    };
    const d = data();
    expect(await saveSession(moved, d, ids)).toEqual({
      status: 'moved',
      stored: await vi.mocked(d.getDraft).mock.results[0]?.value,
    });
    expect(log.warn).toHaveBeenCalledWith('Session draft moved before save', {
      sessionId: 's1',
      courseId: 'git',
    });
    const unread = data({ getDraft: vi.fn(async () => Promise.reject(new Error('offline'))) });
    expect(await saveSession(moved, unread, ids)).toEqual({ status: 'moved', stored: null });
    expect(log.warn).toHaveBeenCalledWith('Session draft not checked', {
      sessionId: 's1',
      courseId: 'git',
    });
    expect(log.error).not.toHaveBeenCalled();

    const failure = Object.assign(new Error('x'), { code: 'unavailable' });
    const failing = {
      saveToDraft: vi.fn(async () => ({
        ok: false as const,
        reason: 'error' as const,
        error: failure,
      })),
    };
    expect(await saveSession(failing, data(), ids)).toEqual({
      status: 'failed',
      message: saveFailure(failure),
    });
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith('Session save to draft failed', failure, {
      sessionId: 's1',
      courseId: 'git',
    });
  });
});

describe('bringing in their changes', () => {
  const doc = (work: Working, over = {}) =>
    draftDoc(work.course, { rev: 6, answers: work.answers, ...over });

  it('turns the stored draft into a working copy and a base', () => {
    const marked = doc(BASE, { answersChanged: true, updatedAt: null });
    expect(workOfDraft(marked)).toEqual({ ...BASE, answersChanged: true });
    expect(workOfDraft(doc(BASE))).toEqual(BASE);
    expect(baseOfDraft(marked)).toEqual({ rev: 6, savedAt: null, work: workOfDraft(marked) });
    expect(baseOfDraft(doc(BASE)).savedAt).toBe('2026-03-01T10:00:00.000Z');
    expect(bringInSummary(doc(BASE), 'Arjun')).toBe('Brought in Draft v6, saved by Arjun');
  });

  it('names each conflict, says why, and shows each side’s rows', () => {
    const mine = change(BASE, (c, a) => {
      c.title = 'Mine';
      c.description = 'My description.';
      c.outcomes = ['Mine'];
      c.rules.passMark = 0.8;
      chapter(c, 'p1').title = 'My basics';
      (chapter(c, 'p1').items[0] as Lesson).title = 'My l1';
      chapter(c, 'p2').items.splice(0, 1);
      // l2 becomes a Quiz in this session.
      const quiz = structuredClone(
        chapter(c, 'p2').items[0],
      ) as Course['chapters'][number]['items'][number];
      chapter(c, 'p1').items[1] = { ...quiz, id: 'l2', title: '' } as typeof quiz;
      a.l2 = { k1: ['a'] };
    });
    const theirs = change(BASE, (c) => {
      c.title = 'Theirs';
      c.description = 'Their description.';
      c.outcomes = ['Theirs'];
      c.rules.passMark = 0.9;
      chapter(c, 'p1').title = 'Their basics';
      (chapter(c, 'p1').items[0] as Lesson).title = 'Their l1';
      (chapter(c, 'p2').items[0] as Lesson).title = 'Their l3';
      (chapter(c, 'p1').items[1] as Lesson).title = 'Their l2';
      chapter(c, 'p1').items.push(lesson('n1', { title: 'Both add' }) as Lesson);
    });
    const mineToo = change(mine, (c) => {
      chapter(c, 'p1').items.push(lesson('n1', { title: 'Both add, mine' }) as Lesson);
    });
    const result = mergeWithDraft(BASE, mineToo, doc(theirs));
    const sides = mergeSides(result);
    expect(sides.mine).toEqual(courseChanges(BASE, mineToo));
    const numbers = numbersOf(mineToo.course);
    const by = (key: string) => result.conflicts.find((c) => c.key === key) as MergeConflict;
    expect(result.conflicts.map((c) => c.key)).toEqual(
      expect.arrayContaining([
        'field:title',
        'field:rules.passMark',
        'field:description',
        'field:outcomes',
        'chapter:p1',
        'lesson:l1',
        'lesson:l3',
        'lesson:n1',
      ]),
    );
    expect(conflictName(by('field:title'), numbers)).toBe('Course details · Title');
    expect(conflictName(by('field:description'), numbers)).toBe('Landing page · Description');
    expect(conflictName(by('field:outcomes'), numbers)).toBe('Landing page · Outcomes');
    expect(conflictName(by('chapter:p1'), numbers)).toBe('1 · My basics');
    expect(conflictName(by('lesson:l1'), numbers)).toBe('1.1 · My l1');
    // Removed in this session: no number, its title from theirs.
    expect(conflictName(by('lesson:l3'), numbers)).toBe('Their l3');
    expect(conflictReason(by('lesson:l3'), 'Arjun')).toBe(
      'This session removed it, and Arjun changed it in the draft.',
    );
    expect(conflictReason(by('field:title'), 'Arjun')).toBe(
      'This session and Arjun both changed it, differently.',
    );
    expect(conflictReason(by('lesson:n1'), 'you')).toBe(
      'This session and you both added it, differently.',
    );

    // Each side's rows: the field alone, or the item's own row.
    const [title] = conflictRows(by('field:title'), sides.mine);
    expect(title).toMatchObject({ kind: 'course', fields: [{ field: 'title' }] });
    const [description] = conflictRows(by('field:description'), sides.theirs);
    expect(description).toMatchObject({
      kind: 'landing',
      fields: [{ field: 'description' }],
      outcomes: [],
    });
    const [outcomes] = conflictRows(by('field:outcomes'), sides.mine);
    expect(outcomes).toMatchObject({ kind: 'landing', fields: [] });
    expect((outcomes as { outcomes: unknown[] }).outcomes.length).toBeGreaterThan(0);
    expect(conflictRows(by('chapter:p1'), sides.theirs).map((r) => r.key)).toEqual(['chapter:p1']);
    expect(conflictRows(by('lesson:l3'), sides.mine).map((r) => r.statuses)).toEqual([['removed']]);
    // A lesson in theirs and a Quiz in this session under one id: both rows.
    const swapped = result.conflicts.find((c) => c.key === 'quiz:l2') as MergeConflict;
    expect(conflictName(swapped, numbers)).toBe('1.2 · Untitled');
    expect(
      conflictRows(swapped, sides.mine)
        .map((r) => r.key)
        .sort(),
    ).toEqual(['lesson:l2', 'quiz:l2']);
    expect(conflictRows(swapped, sides.theirs).map((r) => r.key)).toEqual(['lesson:l2']);
  });

  it('says why a removal on their side is a conflict, and a field set on both', () => {
    const conflict: MergeConflict = {
      key: 'lesson:l1',
      kind: 'lesson',
      id: 'l1',
      chapterId: 'p1',
      reason: 'removedInTheirs',
      base: null,
      mine: null,
      theirs: null,
    };
    expect(conflictReason(conflict, 'Arjun')).toBe(
      'This session changed it, and Arjun removed it from the draft.',
    );
    const image: MergeConflict = {
      key: 'field:cover.image',
      kind: 'field',
      row: 'course',
      field: 'cover.image',
      reason: 'both',
      base: undefined,
      mine: 1,
      theirs: 2,
    };
    expect(conflictReason(image, 'you')).toBe('This session and you both added it, differently.');
  });

  it('says which order was kept', () => {
    const course = makeCourse();
    const numbers = numbersOf(course);
    expect(orderLine({ list: 'chapters' }, course, numbers)).toBe(
      'Both changed the order of the chapters: this session’s order is kept.',
    );
    expect(orderLine({ list: 'items', chapterId: 'p2' }, course, numbers)).toBe(
      'Both changed the order in chapter 2 · History: this session’s order is kept.',
    );
    expect(orderLine({ list: 'items', chapterId: 'gone' }, course, numbers)).toBe(
      'Both changed the order in a chapter: this session’s order is kept.',
    );
  });

  it('writes the settled copy, refusing one that does not fit a course', async () => {
    const theirs = change(BASE, (c) => {
      c.title = 'Theirs';
    });
    const mine = change(BASE, (c) => {
      c.title = 'Mine';
    });
    const stored = doc(theirs);
    const result = mergeWithDraft(BASE, mine, stored);
    const agent = { bringIn: vi.fn(async () => true) };
    expect(await bringInDraft(agent, stored, result, { 'field:title': 'theirs' }, 'Arjun')).toBe(
      'done',
    );
    expect(agent.bringIn).toHaveBeenCalledWith(
      baseOfDraft(stored),
      expect.objectContaining({ course: expect.objectContaining({ title: 'Theirs' }) }),
      'Brought in Draft v6, saved by Arjun',
    );
    agent.bringIn.mockResolvedValueOnce(false);
    expect(await bringInDraft(agent, stored, result, { 'field:title': 'mine' }, 'Arjun')).toBe(
      'failed',
    );

    // Each side adds chapters within the limit; together they are over it.
    const many = (prefix: string, n: number) => (c: Course) => {
      for (let i = 0; i < n; i += 1)
        c.chapters.push({ id: `${prefix}${i}`, title: `${prefix}${i}`, items: [] });
    };
    const wide = mergeWithDraft(
      BASE,
      change(BASE, many('m', 20)),
      doc(change(BASE, many('t', 20))),
    );
    expect(wide.working).not.toBeNull();
    agent.bringIn.mockClear();
    expect(await bringInDraft(agent, stored, wide, {}, 'Arjun')).toBe('invalid');
    expect(agent.bringIn).not.toHaveBeenCalled();
  });
});
