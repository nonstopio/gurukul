import { afterEach, describe, expect, it, vi } from 'vitest';
import { COURSE_BYTES_LIMIT } from '@gurukul/schema';
import type { AuthoringSession, Course } from '@gurukul/schema';
import { HAND_EDIT_NOTE, createAgentSession } from '../src/studio/session/agent';
import type { SessionBase } from '../src/studio/session/agent';
import { START_CHECKPOINT, createSessionStore } from '../src/studio/session/store';
import { TRANSCRIPT_FILE, parseTranscript } from '../src/studio/session/transcript';
import type { Working } from '../src/studio/types';
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

  it('moves only the base when the working copy does not change', async () => {
    const s = await setup();
    await renameTurn(s, 'Git, plainly');
    const base = theirBase(s, () => undefined);
    expect(await s.runtime.bringIn(base, s.state().work as Working, 'Brought in')).toBe(true);
    expect(s.disk().base?.rev).toBe(6);
    expect(s.disk().turns).toHaveLength(1);
    expect(s.state().changes?.count).toBe(1);
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
