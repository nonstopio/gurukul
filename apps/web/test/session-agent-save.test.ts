import { afterEach, describe, expect, it, vi } from 'vitest';
import { COURSE_BYTES_LIMIT } from '@gurukul/schema';
import type { AuthoringSession, Course } from '@gurukul/schema';
import { HAND_EDIT_NOTE, createAgentSession } from '../src/studio/session/agent';
import type { SessionBase } from '../src/studio/session/agent';
import {
  CREATED_DRAFT_REV,
  CREATED_FILE,
  CREATING_FILE,
  START_CHECKPOINT,
  createSessionStore,
  createdBase,
} from '../src/studio/session/store';
import { TRANSCRIPT_FILE, parseTranscript } from '../src/studio/session/transcript';
import type { Working } from '../src/studio/types';
import { blankCourse } from '@gurukul/schema';
import { makeCourse } from './fake-data';
import { AGENT_SESSION_ID, fakeAgent, fakeDesktop } from './fake-desktop';
import { draftDoc } from './fake-studio';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
const { log } = await import('../src/log');

const T0 = new Date('2026-11-19T10:00:00.000Z');
const REFUSED = new Error('Error invoking remote method: Error: Not allowed');

/** A session on disk (base: Draft v4 of Git, keys `q1: k1 → a`), its bridge and the runtime, opened. */
async function setup(init: { kind?: 'new' | 'edit'; open?: boolean } = {}) {
  const fake = fakeDesktop();
  const agent = fakeAgent(fake.desktop);
  const store = createSessionStore({
    desktop: fake.desktop,
    uid: 'u1',
    now: () => T0,
    newId: () => 's1',
  });
  const started = await store.start(
    init.kind === 'new'
      ? { kind: 'new', goal: 'A course on Git.' }
      : { kind: 'edit', courseId: 'git', goal: 'Simplify chapter one.' },
    async () => draftDoc(makeCourse(), { rev: 4, answers: { q1: { k1: ['a'] } } }),
  );
  if (started.status !== 'started') throw new Error('not started');
  let n = 0;
  const runtime = createAgentSession({
    desktop: fake.desktop,
    uid: 'u1',
    sessionId: 's1',
    store,
    now: () => T0,
    newId: () => `t${++n}`,
  });
  runtime.subscribe(vi.fn());
  if (init.open !== false) await runtime.open();
  const disk = () => JSON.parse(fake.files.get('u1/s1/session.json') as string) as AuthoringSession;
  const chat = () => parseTranscript(fake.files.get(`u1/s1/${TRANSCRIPT_FILE}`) ?? '').entries;
  return { ...fake, ...agent, store, runtime, disk, chat, state: runtime.getState };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** One turn by the agent: renames the course. */
async function renameTurn(s: Setup, title: string) {
  expect(await s.runtime.send(`Rename the course to ${title}.`)).toBe(true);
  await s.call('set_course_details', { title });
  s.emit({ type: 'turn_end', sessionId: 's1', agentSessionId: AGENT_SESSION_ID, outcome: 'done' });
  await s.runtime.settled();
}

const edited = (w: Working, edit: (c: Course) => void): Working => {
  const next = structuredClone(w);
  edit(next.course);
  return next;
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('Save to draft in the runtime', () => {
  it('writes the working copy once against the base rev, then closes the session as saved', async () => {
    const s = await setup();
    await renameTurn(s, 'Git, plainly');
    expect(s.state().canSave).toBe(true);
    let during: boolean | null = null;
    const write = vi.fn(async (work: Working, rev: number) => {
      during = s.state().saving;
      // Nothing else changes the course while it is written.
      expect(s.state().canSend).toBe(false);
      expect(s.state().canUndo).toBe(false);
      expect(s.state().canEdit).toBe(false);
      expect(s.runtime.busy()).toBe(true);
      expect(work.course.title).toBe('Git, plainly');
      return rev + 1;
    });
    expect(await s.runtime.saveToDraft(write)).toEqual({ ok: true, rev: 5, kept: true });
    expect(during).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[1]).toBe(4);
    expect(s.state()).toMatchObject({ status: 'closed', saving: false, canSave: false });
    // The base stays the draft it was compared with, so Review still shows what was saved.
    expect(s.disk()).toMatchObject({ status: 'saved', base: { rev: 4 } });
    expect(s.disk().work.course.title).toBe('Git, plainly');
    expect(s.agent.close).toHaveBeenCalledWith('s1');
    expect(s.listening()).toBe(0);
    expect(log.info).toHaveBeenCalledWith('Session saved to draft', {
      sessionId: 's1',
      courseId: 'git',
      rev: 5,
      changes: 1,
    });
    // A closed session saves nothing more.
    expect(await s.runtime.saveToDraft(write)).toEqual({ ok: false, reason: 'busy' });
  });

  it('marks changed answer keys as Studio marks them', async () => {
    const s = await setup();
    await s.runtime.educatorTurn(
      { ...(s.state().work as Working), answers: { q1: { k1: ['b'] } } },
      'Changed the key',
    );
    const write = vi.fn(async (_work: Working, rev: number) => rev + 1);
    await s.runtime.saveToDraft(write);
    expect(write.mock.calls[0]?.[0]).toMatchObject({ answersChanged: true });
    expect(s.disk().work.answersChanged).toBe(true);
  });

  it('keeps the session open, as it was, when the write fails', async () => {
    const s = await setup();
    await renameTurn(s, 'Git, plainly');
    const failure = Object.assign(new Error('offline'), { code: 'unavailable' });
    expect(
      await s.runtime.saveToDraft(async () => {
        throw failure;
      }),
    ).toEqual({ ok: false, reason: 'error', error: failure });
    expect(s.state()).toMatchObject({ status: 'ready', saving: false, canSave: true });
    expect(s.disk().status).toBe('open');
    // The page logs it once; the runtime does not.
    expect(log.error).not.toHaveBeenCalled();
  });

  it('says the draft was written even when this computer cannot mark the session saved', async () => {
    const s = await setup();
    await renameTurn(s, 'Git, plainly');
    s.store.close = vi.fn(async () => {
      throw REFUSED;
    });
    s.agent.close.mockRejectedValueOnce(REFUSED);
    expect(await s.runtime.saveToDraft(async (_w, rev) => rev + 1)).toEqual({
      ok: true,
      rev: 5,
      kept: false,
    });
    expect(s.state().session?.status).toBe('saved');
    expect(s.state().status).toBe('closed');
    expect(log.warn).toHaveBeenCalledWith('Session not marked saved', {
      sessionId: 's1',
      reason: 'refused',
    });
    expect(log.warn).toHaveBeenCalledWith('Agent not closed', {
      sessionId: 's1',
      reason: 'refused',
    });
  });

  it('refuses a new course, an invalid or oversized copy, and a busy session', async () => {
    const fresh = await setup({ kind: 'new' });
    expect(await fresh.runtime.saveToDraft(vi.fn())).toEqual({ ok: false, reason: 'new_course' });

    const s = await setup();
    const write = vi.fn(async (_w: Working, rev: number) => rev + 1);
    // An Educator's turn may not be written yet: its copy goes into memory first.
    const work = s.state().work as Working;
    const big = edited(work, (c) => {
      // Every block within the schema; together over the size limit.
      const blocks = Array.from({ length: 50 }, (_, i) => ({
        type: 'markdown' as const,
        id: `m${i}`,
        md: 'x'.repeat(20_000),
      }));
      Object.assign(c.chapters[0]?.items[0] ?? {}, { blocks });
    });
    expect(JSON.stringify(big).length).toBeGreaterThan(COURSE_BYTES_LIMIT);
    expect(await s.runtime.educatorTurn(big, 'Long lesson')).toBe(true);
    expect(await s.runtime.saveToDraft(write)).toEqual({ ok: false, reason: 'invalid' });
    expect(write).not.toHaveBeenCalled();

    // During a turn.
    expect(await s.runtime.send('Shorten it.')).toBe(true);
    expect(s.state().canSave).toBe(false);
    expect(await s.runtime.saveToDraft(write)).toEqual({ ok: false, reason: 'busy' });
  });

  it('refuses while the agent is being started, and the agent is not retried during a save', async () => {
    const s = await setup({ open: false });
    let answer: (v: { state: 'not_installed' }) => void = () => undefined;
    s.agent.status.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve as typeof answer)),
    );
    const opened = s.runtime.open();
    await vi.waitFor(() => expect(s.state().status).toBe('connecting'));
    expect(s.state().canSave).toBe(false);
    expect(await s.runtime.saveToDraft(vi.fn())).toEqual({ ok: false, reason: 'busy' });
    answer({ state: 'not_installed' });
    await opened;
    // Claude Code cannot run, and the session can still be saved.
    expect(s.state()).toMatchObject({ status: 'unavailable', canSave: true });
    let release: (rev: number) => void = () => undefined;
    const saving = s.runtime.saveToDraft(
      () => new Promise<number>((resolve) => (release = resolve)),
    );
    await vi.waitFor(() => expect(s.state().saving).toBe(true));
    await s.runtime.retry();
    expect(s.agent.status).toHaveBeenCalledTimes(1);
    expect(await s.runtime.send('Hello')).toBe(false);
    expect(await s.runtime.undo()).toBe(false);
    expect(s.runtime.edit((w) => w)).toBe(false);
    release(5);
    expect(await saving).toMatchObject({ ok: true, rev: 5 });
  });
});

describe('Bring in their changes in the runtime', () => {
  /** The stored draft someone saved meanwhile, as the session's next base. */
  const theirBase = (s: Setup, edit: (c: Course) => void): SessionBase => ({
    rev: 6,
    savedAt: '2026-11-19T11:00:00.000Z',
    work: edited(s.state().base as Working, edit),
  });

  it('makes the merged copy a turn by the Educator, with the stored draft as the base', async () => {
    const s = await setup();
    const base = theirBase(s, (c) => {
      c.summary = 'Their summary.';
    });
    const merged = edited(s.state().work as Working, (c) => {
      c.summary = 'Their summary.';
    });
    expect(await s.runtime.bringIn(base, merged, 'Brought in Draft v6, saved by Arjun')).toBe(true);
    expect(s.disk().base).toMatchObject({ rev: 6, savedAt: '2026-11-19T11:00:00.000Z' });
    expect(s.disk().turns).toMatchObject([
      { by: 'educator', summary: 'Brought in Draft v6, saved by Arjun', changes: 1 },
    ]);
    // The first turn keeps the copy from before it, for Undo.
    expect(s.files.has(`u1/s1/checkpoints/${START_CHECKPOINT}`)).toBe(true);
    expect(s.chat().at(-1)).toMatchObject({
      kind: 'notice',
      text: 'Brought in Draft v6, saved by Arjun',
    });
    // Against the new base nothing differs, and the agent is told the course changed.
    expect(s.state().changes?.count).toBe(0);
    expect(await s.runtime.send('Carry on.')).toBe(true);
    expect(s.agent.send).toHaveBeenCalledWith('s1', `${HAND_EDIT_NOTE}Carry on.`);
  });

  it('is a turn with no changes when the working copy does not change, since the base moves', async () => {
    const s = await setup();
    await renameTurn(s, 'Git, plainly');
    const base = theirBase(s, () => undefined);
    expect(await s.runtime.bringIn(base, s.state().work as Working, 'Brought in')).toBe(true);
    expect(s.disk().base?.rev).toBe(6);
    expect(s.disk().turns).toMatchObject([
      { by: 'agent' },
      { by: 'educator', changes: 0, baseBefore: 't2.base.json' },
    ]);
    expect(s.state().changes?.count).toBe(1);
  });

  it('puts back the base from before it on Undo, so a save cannot go over their draft', async () => {
    const s = await setup();
    const base = theirBase(s, (c) => {
      c.summary = 'Their summary.';
    });
    const merged = edited(s.state().work as Working, (c) => {
      c.summary = 'Their summary.';
    });
    expect(await s.runtime.bringIn(base, merged, 'Brought in')).toBe(true);
    expect(s.files.has('u1/s1/checkpoints/t1.base.json')).toBe(true);
    expect(s.state().changes?.count).toBe(0);

    expect(await s.runtime.undo()).toBe(true);
    // The copy from before the merge, compared with the draft from before it: nothing to save,
    // and the stored draft (rev 6) reads as moved again, so the page offers the merge again.
    expect(s.disk().base?.rev).toBe(4);
    expect(s.state().base?.course.summary).not.toBe('Their summary.');
    expect(s.state().changes?.count).toBe(0);
    expect(s.state().turns).toHaveLength(0);
    expect(s.files.has('u1/s1/checkpoints/t1.base.json')).toBe(false);
    expect(s.files.has('u1/s1/checkpoints/t1.json')).toBe(false);
    // A save now goes against rev 4, which Studio's transaction refuses while the draft is at 6.
    const write = vi.fn(async (_work: Working, rev: number) => rev + 1);
    await s.runtime.saveToDraft(write);
    expect(write.mock.calls[0]?.[1]).toBe(4);
  });

  it('puts back the base on Undo of a turn made before a merge that changed nothing', async () => {
    const s = await setup();
    await renameTurn(s, 'Git, plainly');
    // Their draft changed the title too; this session's was kept.
    const base = theirBase(s, (c) => {
      c.title = 'Git for teams';
    });
    expect(await s.runtime.bringIn(base, s.state().work as Working, 'Brought in')).toBe(true);
    expect(await s.runtime.undo()).toBe(true);
    expect(s.disk().base?.rev).toBe(4);
    expect(await s.runtime.undo()).toBe(true);
    // Back where it started, against the draft it started from: their title is not undone.
    expect(s.disk().base?.rev).toBe(4);
    expect(s.state().changes?.count).toBe(0);
  });

  it('cannot undo a merge whose base from before it is no longer on this computer', async () => {
    const s = await setup();
    await renameTurn(s, 'Git, plainly');
    const base = theirBase(s, () => undefined);
    expect(await s.runtime.bringIn(base, s.state().work as Working, 'Brought in')).toBe(true);
    s.files.delete('u1/s1/checkpoints/t2.base.json');
    expect(await s.runtime.undo()).toBe(false);
    expect(s.state().problem?.code).toBe('undo_unavailable');
    expect(s.disk().base?.rev).toBe(6);
    expect(s.disk().turns).toHaveLength(2);
  });

  it('writes nothing when it cannot, and refuses while busy', async () => {
    const s = await setup();
    s.desktop.store.write.mockRejectedValueOnce(REFUSED);
    const base = theirBase(s, (c) => {
      c.summary = 'Theirs.';
    });
    expect(await s.runtime.bringIn(base, base.work as Working, 'Brought in')).toBe(false);
    expect(s.disk().base?.rev).toBe(4);
    expect(s.state()).toMatchObject({ saving: false, problem: { code: 'app' } });
    expect(log.error).toHaveBeenCalledWith('Session draft not brought in', REFUSED, {
      sessionId: 's1',
      rev: 6,
    });

    expect(await s.runtime.send('Shorten it.')).toBe(true);
    expect(await s.runtime.bringIn(base, base.work as Working, 'Brought in')).toBe(false);
  });

  it('holds back an Educator’s turn while a merge is written', async () => {
    const s = await setup();
    let release: () => void = () => undefined;
    const write = s.desktop.store.write.getMockImplementation();
    s.desktop.store.write.mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => (release = resolve));
      return write?.(...args);
    });
    const base = theirBase(s, () => undefined);
    const bringing = s.runtime.bringIn(base, s.state().work as Working, 'Brought in');
    expect(s.state().saving).toBe(true);
    expect(await s.runtime.educatorTurn(s.state().work as Working, 'Mine')).toBe(false);
    release();
    expect(await bringing).toBe(true);
  });
});

describe('A new course’s first save in the runtime', () => {
  /** The draft `createCourse` wrote for the session's course, as the page builds it. */
  const created = (s: Setup, title = 'Code review') =>
    createdBase(s.state().work as Working, {
      courseId: 'code-review',
      title,
      uid: 'u1',
      educatorName: 'Priya N',
      at: T0.toISOString(),
    });

  it('makes the session an edit session on the created course, with its draft as the base', async () => {
    const s = await setup({ kind: 'new' });
    await renameTurn(s, 'Reviewing code');
    expect(await s.runtime.saveToDraft(vi.fn())).toEqual({ ok: false, reason: 'new_course' });

    expect(await s.runtime.courseCreated(created(s, 'Code review, plainly'))).toBe(true);
    expect(s.disk()).toMatchObject({
      kind: 'edit',
      courseId: 'code-review',
      status: 'open',
      base: { rev: CREATED_DRAFT_REV, savedAt: T0.toISOString() },
    });
    // The working copy is the course's now: its id and the title the Educator gave it.
    expect(s.disk().work.course).toMatchObject({
      id: 'code-review',
      title: 'Code review, plainly',
      educatorIds: ['u1'],
      // What the placeholder title made, and nothing changed since, follows the real title.
      certificate: { title: 'Code review, plainly' },
      cover: { glyph: 'C' },
    });
    expect(s.disk().base?.work.course).toMatchObject({
      id: 'code-review',
      title: 'Code review, plainly',
      chapters: [],
    });
    expect(s.state()).toMatchObject({ saving: false, canSave: true, problem: null });
    expect(log.info).toHaveBeenCalledWith('Session course created', {
      sessionId: 's1',
      courseId: 'code-review',
    });
    // Only once: it has a course now.
    expect(await s.runtime.courseCreated(created(s))).toBe(false);

    // Undo of a turn from before the course existed keeps the session on its course, with the
    // title the Educator gave it and what that title made: creating it was not a turn.
    expect(await s.runtime.undo()).toBe(true);
    expect(s.disk().work.course).toMatchObject({
      id: 'code-review',
      title: 'Code review, plainly',
      certificate: { title: 'Code review, plainly' },
      cover: { glyph: 'C' },
    });
    expect(s.state().changes?.count).toBe(0);
    expect(s.disk()).toMatchObject({ kind: 'edit', courseId: 'code-review', base: { rev: 1 } });

    // The agent is told the course changed under it.
    expect(await s.runtime.send('Carry on.')).toBe(true);
    expect(s.agent.send).toHaveBeenLastCalledWith('s1', expect.stringContaining(HAND_EDIT_NOTE));
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await s.runtime.settled();

    // Then it saves like any edit session, against the created draft.
    const write = vi.fn(async (_work: Working, rev: number) => rev + 1);
    expect(await s.runtime.saveToDraft(write)).toEqual({ ok: true, rev: 2, kept: true });
    expect(write.mock.calls[0]?.[1]).toBe(CREATED_DRAFT_REV);
    expect(write.mock.calls[0]?.[0].course.id).toBe('code-review');
  });

  it('keeps a turn that could not be written the one Undo takes back, on the course', async () => {
    const s = await setup({ kind: 'new' });
    const saveTurn = s.store.saveTurn;
    s.store.saveTurn = vi.fn().mockRejectedValueOnce(REFUSED).mockImplementation(saveTurn);
    await renameTurn(s, 'Reviewing code');
    expect(s.state().unsaved).not.toBeNull();

    expect(await s.runtime.courseCreated(created(s))).toBe(true);
    expect(s.disk().work.course).toMatchObject({ id: 'code-review', title: 'Code review' });
    expect(await s.runtime.undo()).toBe(true);
    expect(s.state().unsaved).toBeNull();
    expect(s.disk().work.course).toMatchObject({ id: 'code-review', title: 'Code review' });
    expect(s.disk().courseId).toBe('code-review');
  });

  it('keeps a created course it could not note, for this runtime and the next one', async () => {
    const s = await setup({ kind: 'new' });
    expect(s.state().pendingCourse).toBeNull();
    const base = created(s);
    // `created.json` is written, then `session.json` is refused.
    const write = s.desktop.store.write.getMockImplementation();
    s.desktop.store.write
      .mockImplementationOnce(async (...args) => write?.(...args))
      .mockRejectedValueOnce(REFUSED);
    expect(await s.runtime.courseCreated(base)).toBe(false);
    expect(s.disk()).toMatchObject({ kind: 'new', courseId: null, base: null });
    expect(s.state().pendingCourse).toEqual(base);
    expect(JSON.parse(s.files.get(`u1/s1/${CREATED_FILE}`) as string)).toEqual(base);

    // The app closed: a runtime opened later still knows the course exists.
    s.runtime.dispose();
    const again = createAgentSession({
      desktop: s.desktop,
      uid: 'u1',
      sessionId: 's1',
      store: s.store,
      now: () => T0,
    });
    await again.open();
    expect(again.getState().pendingCourse).toEqual(base);
    expect(await again.courseCreated(base)).toBe(true);
    expect(again.getState().pendingCourse).toBeNull();
    expect(again.getState().session).toMatchObject({ kind: 'edit', courseId: 'code-review' });

    // Once noted, the file is not read again: the session has its course.
    const third = createAgentSession({
      desktop: s.desktop,
      uid: 'u1',
      sessionId: 's1',
      store: s.store,
      now: () => T0,
    });
    await third.open();
    expect(third.getState().pendingCourse).toBeNull();
  });

  it('keeps a created course in memory when its note cannot be written either, or read', async () => {
    const s = await setup({ kind: 'new' });
    const base = created(s);
    s.desktop.store.write.mockRejectedValueOnce(REFUSED).mockRejectedValueOnce(REFUSED);
    expect(await s.runtime.courseCreated(base)).toBe(false);
    expect(s.state().pendingCourse).toEqual(base);
    expect(s.files.has(`u1/s1/${CREATED_FILE}`)).toBe(false);
    expect(log.warn).toHaveBeenCalledWith('Session created course not kept', {
      sessionId: 's1',
      courseId: 'code-review',
      reason: 'refused',
    });

    // A note this app cannot read is left alone: the session stays a new course.
    s.files.set(`u1/s1/${CREATED_FILE}`, '{"rev":1}');
    const reopened = createAgentSession({
      desktop: s.desktop,
      uid: 'u1',
      sessionId: 's1',
      store: s.store,
      now: () => T0,
    });
    await reopened.open();
    expect(reopened.getState().pendingCourse).toBeNull();
    // Read first by the session itself, so refuse the read of `created.json` only.
    const read = s.desktop.store.read.getMockImplementation();
    s.desktop.store.read.mockReset();
    s.desktop.store.read.mockImplementation(async (file) => {
      if (file.path === CREATED_FILE) throw REFUSED;
      return read?.(file) ?? null;
    });
    const refused = createAgentSession({
      desktop: s.desktop,
      uid: 'u1',
      sessionId: 's1',
      store: s.store,
      now: () => T0,
    });
    await refused.open();
    expect(refused.getState()).toMatchObject({ pendingCourse: null, status: 'ready' });
    expect(log.warn).toHaveBeenCalledWith('Session created course not read', {
      sessionId: 's1',
      reason: 'refused',
    });
  });

  it('keeps a course created while the session was busy, to note once it is not', async () => {
    const s = await setup({ kind: 'new' });
    expect(await s.runtime.send('Start.')).toBe(true);
    const base = created(s);
    expect(await s.runtime.courseCreated(base)).toBe(false);
    expect(s.state().pendingCourse).toEqual(base);
    expect(s.disk().kind).toBe('new');
  });

  it('writes nothing when it cannot, and refuses an edit session or a busy one', async () => {
    const s = await setup({ kind: 'new' });
    s.desktop.store.write.mockRejectedValueOnce(REFUSED).mockRejectedValueOnce(REFUSED);
    expect(await s.runtime.courseCreated(created(s))).toBe(false);
    expect(s.disk()).toMatchObject({ kind: 'new', courseId: null, base: null });
    expect(s.state()).toMatchObject({ saving: false, problem: { code: 'app' } });
    expect(s.state().session?.base).toBeNull();
    expect(log.error).toHaveBeenCalledWith('Session course not noted', REFUSED, {
      sessionId: 's1',
      courseId: 'code-review',
    });
    // A certificate title and cover letter the session chose are kept.
    expect(
      await s.runtime.educatorTurn(
        edited(s.state().work as Working, (c) => {
          c.certificate.title = 'Reviewer';
          c.cover.glyph = 'R';
        }),
        'Named the certificate',
      ),
    ).toBe(true);
    // Asked again, it is noted: the course is not created again for it.
    expect(await s.runtime.courseCreated(created(s))).toBe(true);
    expect(s.disk().courseId).toBe('code-review');
    expect(s.disk().work.course).toMatchObject({
      title: 'Code review',
      certificate: { title: 'Reviewer' },
      cover: { glyph: 'R' },
    });

    const edit = await setup();
    expect(await edit.runtime.courseCreated(created(edit))).toBe(false);

    const busy = await setup({ kind: 'new' });
    expect(await busy.runtime.send('Start.')).toBe(true);
    expect(await busy.runtime.courseCreated(created(busy))).toBe(false);
    expect(busy.disk().kind).toBe('new');
  });
});

describe('a new course created before the app closed (DSK-28)', () => {
  /** The blank draft `createCourse` wrote at `code-review` for u1, just after T0. */
  const made = (educatorId = 'u1') =>
    draftDoc(
      blankCourse({
        id: 'code-review',
        title: 'Code review',
        level: 'foundation',
        theme: 'forest',
        educatorId,
      }),
      { rev: 1, updatedBy: educatorId, updatedAt: new Date(T0.getTime() + 1000) },
    );

  it('notes each attempt, keeping when the first at an address began, for the next runtime', async () => {
    const s = await setup({ kind: 'new' });
    expect(s.state().creating).toBeNull();
    await s.runtime.noteCreating('code-review', 'Code review');
    const first = { slug: 'code-review', title: 'Code review', since: T0.toISOString() };
    expect(s.state().creating).toEqual(first);
    expect(JSON.parse(s.files.get(`u1/s1/${CREATING_FILE}`) as string)).toEqual(first);

    // The app closed: the next runtime starts from the note.
    s.runtime.dispose();
    let at = T0.getTime();
    const later = () => new Date((at += 60_000));
    const again = createAgentSession({
      desktop: s.desktop,
      uid: 'u1',
      sessionId: 's1',
      store: s.store,
      now: later,
    });
    await again.open();
    expect(again.getState().creating).toEqual(first);
    // The same address again keeps its first date (a course that attempt made is no older); a
    // new title is kept for the dialog.
    await again.noteCreating('code-review', 'Code review, plainly');
    expect(again.getState().creating).toEqual({ ...first, title: 'Code review, plainly' });
    await again.noteCreating('code-review-2', 'Code review');
    expect(again.getState().creating?.since).not.toBe(T0.toISOString());

    // Recognised: its own blank course at the address it tried.
    expect(await again.ownCourse(made())).toBeNull();
    await again.noteCreating('code-review', 'Code review');
    const since = again.getState().creating?.since as string;
    const own = draftDoc(made().course, {
      rev: 1,
      updatedBy: 'u1',
      updatedAt: new Date(Date.parse(since) + 1000),
    });
    expect(await again.ownCourse(own)).toMatchObject({
      rev: 1,
      work: { course: { id: 'code-review' } },
    });
    expect(await again.ownCourse(made('u2'))).toBeNull();
  });

  it('notes nothing, and recognises nothing, for an edit session or before it opens', async () => {
    const s = await setup({ open: false });
    expect(await s.runtime.ownCourse(made())).toBeNull();
    await s.runtime.noteCreating('code-review', 'Code review');
    expect(s.files.has(`u1/s1/${CREATING_FILE}`)).toBe(false);
    await s.runtime.open();
    await s.runtime.noteCreating('code-review', 'Code review');
    expect(s.state().creating).toBeNull();
    expect(s.files.has(`u1/s1/${CREATING_FILE}`)).toBe(false);
    expect(await s.runtime.ownCourse(made())).toBeNull();

    // A new course with no attempt noted recognises nothing either.
    const fresh = await setup({ kind: 'new' });
    expect(await fresh.runtime.ownCourse(made())).toBeNull();
  });

  it('leaves a course another session on this computer has to that session', async () => {
    const s = await setup({ kind: 'new' });
    await s.runtime.noteCreating('code-review', 'Code review');
    const other = await s.store.start(
      { kind: 'edit', courseId: 'code-review', goal: 'Another go.', id: 's2' },
      async () => made(),
    );
    expect(other.status).toBe('started');
    expect(await s.runtime.ownCourse(made())).toBeNull();
    // Unable to look, it says taken rather than guess.
    s.desktop.store.list.mockRejectedValueOnce(REFUSED);
    expect(await s.runtime.ownCourse(made())).toBeNull();
    expect(log.warn).toHaveBeenCalledWith('Session course not recognised', {
      sessionId: 's1',
      courseId: 'code-review',
      reason: 'refused',
    });
  });

  it('goes on when the note cannot be written or read', async () => {
    const s = await setup({ kind: 'new' });
    s.desktop.store.write.mockRejectedValueOnce(REFUSED);
    await s.runtime.noteCreating('code-review', 'Code review');
    expect(s.state().creating).toMatchObject({ slug: 'code-review' });
    expect(log.warn).toHaveBeenCalledWith('Session course attempt not kept', {
      sessionId: 's1',
      reason: 'refused',
    });
    const read = s.desktop.store.read.getMockImplementation();
    s.desktop.store.read.mockImplementation(async (file) => {
      if (file.path === CREATING_FILE) throw REFUSED;
      return read?.(file) ?? null;
    });
    const reopened = createAgentSession({
      desktop: s.desktop,
      uid: 'u1',
      sessionId: 's1',
      store: s.store,
      now: () => T0,
    });
    await reopened.open();
    expect(reopened.getState()).toMatchObject({ creating: null, status: 'ready' });
    expect(log.warn).toHaveBeenCalledWith('Session course attempt not read', {
      sessionId: 's1',
      reason: 'refused',
    });
  });
});
