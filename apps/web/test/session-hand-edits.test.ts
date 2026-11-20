import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_MESSAGE_LENGTH } from '@gurukul/desktop/bridge';
import { SESSION_CHECKPOINTS_KEPT } from '@gurukul/schema';
import type { AuthoringSession } from '@gurukul/schema';
import { courseChanges } from '@gurukul/schema/changes';
import {
  HAND_EDIT_NOTE,
  MESSAGE_MAX_LENGTH,
  createAgentSession,
  handSummary,
  undoNote,
} from '../src/studio/session/agent';
import type { AgentSessionOptions } from '../src/studio/session/agent';
import {
  AGENT_NOTE_FILE,
  EDITING_FILE,
  START_CHECKPOINT,
  createSessionStore,
} from '../src/studio/session/store';
import type { SessionStore } from '../src/studio/session/store';
import { TRANSCRIPT_FILE, parseTranscript } from '../src/studio/session/transcript';
import type { Working } from '../src/studio/types';
import { lesson, makeCourse } from './fake-data';
import { AGENT_SESSION_ID, fakeAgent, fakeDesktop } from './fake-desktop';
import { draftDoc } from './fake-studio';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
const { log } = await import('../src/log');

const T0 = new Date('2026-11-19T10:00:00.000Z');
const FAILED = new Error('Error invoking remote method: Error: store.write failed (EACCES)');

/** Renames lesson `id` in a working copy, as the lesson editor's title field does. */
const retitle =
  (id: string, title: string) =>
  (w: Working): Working => ({
    ...w,
    course: {
      ...w.course,
      chapters: w.course.chapters.map((c) => ({
        ...c,
        items: c.items.map((i) => (i.id === id ? { ...i, title } : i)),
      })),
    },
  });

type Init = {
  kind?: 'new' | 'edit';
  agent?: Parameters<typeof fakeAgent>[1];
  /** Wraps the store the runtime uses, to make one of its calls fail. */
  store?: (store: SessionStore) => SessionStore;
  options?: Partial<AgentSessionOptions>;
  /** Files on disk before the runtime opens, beside the session. */
  files?: (store: SessionStore, session: AuthoringSession) => Promise<void>;
};

async function setup(init: Init = {}) {
  const fake = fakeDesktop();
  const agent = fakeAgent(fake.desktop, init.agent);
  const real = createSessionStore({
    desktop: fake.desktop,
    uid: 'u1',
    now: () => T0,
    newId: () => 's1',
  });
  const started = await real.start(
    init.kind === 'new'
      ? { kind: 'new', goal: 'A course on Git.' }
      : { kind: 'edit', courseId: 'git', goal: 'Simplify chapter one.' },
    async () => draftDoc(makeCourse(), { rev: 4 }),
  );
  if (started.status !== 'started') throw new Error('not started');
  await init.files?.(real, started.session);
  const store = init.store ? init.store(real) : real;
  let n = 0;
  const runtime = createAgentSession({
    desktop: fake.desktop,
    uid: 'u1',
    sessionId: 's1',
    store,
    now: () => T0,
    newId: () => `t${++n}`,
    ...init.options,
  });
  const disk = () => JSON.parse(fake.files.get('u1/s1/session.json') as string) as AuthoringSession;
  const chat = () => parseTranscript(fake.files.get(`u1/s1/${TRANSCRIPT_FILE}`) ?? '').entries;
  const noted = () => fake.files.has(`u1/s1/${EDITING_FILE}`);
  const note = () => fake.files.get(`u1/s1/${AGENT_NOTE_FILE}`);
  /** A new runtime over the same files, as after the app closed or every screen let it go. */
  const reopen = async () => {
    const next = createAgentSession({
      desktop: fake.desktop,
      uid: 'u1',
      sessionId: 's1',
      store,
      now: () => T0,
      newId: () => `t${++n}`,
      ...init.options,
    });
    await next.open();
    return next;
  };
  return {
    ...fake,
    ...agent,
    store,
    runtime,
    disk,
    chat,
    noted,
    note,
    reopen,
    state: runtime.getState,
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const titleOf = (w: Working | AuthoringSession['work'] | null, id: string) =>
  w?.course.chapters.flatMap((c) => c.items).find((i) => i.id === id)?.title;

/** One agent turn that renames the course. */
async function agentTurn(s: Setup, title: string) {
  expect(await s.runtime.send(`Rename the course to ${title}.`)).toBe(true);
  await s.call('set_course_details', { title });
  s.emit({ type: 'turn_end', sessionId: 's1', agentSessionId: AGENT_SESSION_ID, outcome: 'done' });
  await s.runtime.settled();
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('words for hand edits', () => {
  it('names each kind of row in a hand-edit turn’s line', () => {
    const before = { course: makeCourse(), answers: {} };
    const after = {
      course: makeCourse({
        title: 'Git again',
        description: 'Learn more Git.',
        chapters: [
          { id: 'p1', title: 'Basics, now', items: [lesson('l1', { title: '' })] },
          ...makeCourse().chapters.slice(1),
        ],
      }),
      answers: {},
    };
    expect(handSummary(courseChanges(before, after))).toBe(
      'Edited by hand: course details, landing page, Basics, now, Untitled, Lesson l2',
    );
  });

  it('leaves room for both notes under the shell’s message limit', () => {
    expect(
      MESSAGE_MAX_LENGTH + undoNote(SESSION_CHECKPOINTS_KEPT).length + HAND_EDIT_NOTE.length,
    ).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
  });
});

describe('hand edits in a session', () => {
  it('changes the copy in memory, writes it at a pause, and becomes one turn by the Educator', async () => {
    const s = await setup();
    await s.runtime.open();
    expect(s.state().canEdit).toBe(true);
    expect(s.state().handEdits).toBeNull();

    expect(s.runtime.edit(retitle('l1', 'Why Git'))).toBe(true);
    expect(s.runtime.edit(retitle('l2', 'How Git'))).toBe(true);
    let view = s.state();
    expect(titleOf(view.work, 'l1')).toBe('Why Git');
    expect(view.handEdits).toEqual({ state: 'dirty', savedAt: null });
    expect(view.changes?.count).toBe(2);
    // Only between turns, and nothing else while they are open.
    expect(view.canSend).toBe(false);
    expect(view.canUndo).toBe(false);
    expect(s.runtime.busy()).toBe(true);
    expect(await s.runtime.send('Go on.')).toBe(false);
    expect(await s.runtime.undo()).toBe(false);
    // Nothing on disk until it is kept.
    expect(titleOf(s.disk().work, 'l1')).toBe('Lesson l1');
    expect(s.noted()).toBe(false);

    expect(await s.runtime.keepEdits()).toBe(true);
    expect(s.noted()).toBe(true);
    expect(titleOf(s.disk().work, 'l1')).toBe('Why Git');
    expect(s.disk().turns).toEqual([]);
    expect(s.state().handEdits).toEqual({ state: 'saved', savedAt: T0.toISOString() });
    // Already kept: nothing more to write.
    s.desktop.store.write.mockClear();
    expect(await s.runtime.keepEdits()).toBe(true);
    expect(s.desktop.store.write).not.toHaveBeenCalled();

    await s.runtime.endEdits();
    view = s.state();
    expect(view.handEdits).toBeNull();
    expect(view.canSend).toBe(true);
    expect(s.runtime.busy()).toBe(false);
    expect(view.turns).toEqual([
      {
        id: 't1',
        at: T0.toISOString(),
        by: 'educator',
        summary: 'Edited by hand: Why Git, How Git',
        checkpoint: 't1.json',
        changes: 2,
      },
    ]);
    expect(s.disk().turns).toHaveLength(1);
    expect(s.files.has('u1/s1/checkpoints/t1.json')).toBe(true);
    // The copy before the first turn, for Undo.
    const start = JSON.parse(s.files.get(`u1/s1/checkpoints/${START_CHECKPOINT}`) as string);
    expect(titleOf(start, 'l1')).toBe('Lesson l1');
    expect(s.noted()).toBe(false);
    expect(s.chat().at(-1)).toMatchObject({
      kind: 'notice',
      turnId: 't1',
      text: 'Edited by hand: Why Git, How Git',
    });
    expect(log.info).toHaveBeenCalledWith('Session hand edits saved', {
      sessionId: 's1',
      turnId: 't1',
      changes: 2,
    });

    // The agent hears of them with the next message, once.
    expect(await s.runtime.send('Shorten it.')).toBe(true);
    expect(s.agent.send).toHaveBeenLastCalledWith('s1', `${HAND_EDIT_NOTE}Shorten it.`);
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await s.runtime.settled();
    expect(await s.runtime.send('Again.')).toBe(true);
    expect(s.agent.send).toHaveBeenLastCalledWith('s1', 'Again.');
  });

  it('counts a later hand-edit turn against the turn before it, with no start checkpoint again', async () => {
    const s = await setup();
    await s.runtime.open();
    await agentTurn(s, 'Git basics');
    s.desktop.store.write.mockClear();
    s.runtime.edit(retitle('l1', 'Why Git'));
    await s.runtime.endEdits();
    expect(s.state().turns.map((t) => [t.by, t.changes])).toEqual([
      ['agent', 1],
      ['educator', 1],
    ]);
    const written = s.desktop.store.write.mock.calls.map(([ref]) => ref.path);
    expect(written).not.toContain(`checkpoints/${START_CHECKPOINT}`);
    // Never kept before the turn: no note was needed.
    expect(written).not.toContain(EDITING_FILE);
  });

  it('is undone like any turn, and the agent hears the course changed by hand', async () => {
    const s = await setup();
    await s.runtime.open();
    await agentTurn(s, 'Git basics');
    s.runtime.edit(retitle('l1', 'Why Git'));
    await s.runtime.endEdits();
    expect(await s.runtime.undo()).toBe(true);
    expect(titleOf(s.state().work, 'l1')).toBe('Lesson l1');
    expect(s.state().work?.course.title).toBe('Git basics');
    expect(await s.runtime.send('Go on.')).toBe(true);
    // Not "undid your last turn": the agent never made that one.
    expect(s.agent.send).toHaveBeenLastCalledWith('s1', `${HAND_EDIT_NOTE}Go on.`);
  });

  it('is refused while a turn runs, while closed, and allowed while the agent cannot run', async () => {
    const s = await setup();
    await s.runtime.open();
    expect(await s.runtime.send('Rename it.')).toBe(true);
    expect(s.state().canEdit).toBe(false);
    expect(s.runtime.edit(retitle('l1', 'Why Git'))).toBe(false);
    expect(titleOf(s.state().work, 'l1')).toBe('Lesson l1');
    expect(s.state().handEdits).toBeNull();

    const closed = await setup({
      files: async (store, session) => {
        await store.close(session, 'saved');
      },
    });
    await closed.runtime.open();
    expect(closed.state().canEdit).toBe(false);
    expect(closed.runtime.edit(retitle('l1', 'Why Git'))).toBe(false);

    const offline = await setup({ agent: { status: { state: 'not_installed' } } });
    await offline.runtime.open();
    expect(offline.state().status).toBe('unavailable');
    expect(offline.state().canEdit).toBe(true);
    expect(offline.runtime.edit(retitle('l1', 'Why Git'))).toBe(true);
    await offline.runtime.endEdits();
    expect(offline.state().turns).toHaveLength(1);
  });

  it('keeps an incomplete copy in memory only, and drops it back to the last one kept', async () => {
    const s = await setup();
    await s.runtime.open();
    s.runtime.edit(retitle('l1', 'Why Git'));
    expect(await s.runtime.keepEdits()).toBe(true);
    // A second write in the same edits: the note is there already.
    s.runtime.edit(retitle('l1', 'Why Git, again'));
    expect(await s.runtime.keepEdits()).toBe(true);
    expect(titleOf(s.disk().work, 'l1')).toBe('Why Git, again');
    // An empty title does not pass the course schema: not written.
    s.runtime.edit(retitle('l2', ''));
    expect(await s.runtime.keepEdits()).toBe(false);
    expect(s.state().handEdits?.state).toBe('incomplete');
    expect(titleOf(s.disk().work, 'l2')).toBe('Lesson l2');

    await s.runtime.endEdits();
    expect(log.warn).toHaveBeenCalledWith('Session hand edits dropped', {
      sessionId: 's1',
      reason: 'incomplete',
    });
    expect(titleOf(s.state().work, 'l1')).toBe('Why Git, again');
    expect(titleOf(s.state().work, 'l2')).toBe('Lesson l2');
    expect(s.state().turns.map((t) => t.changes)).toEqual([1]);
  });

  it('makes no turn of edits that were never complete, or that came to nothing', async () => {
    const s = await setup();
    await s.runtime.open();
    s.runtime.edit(retitle('l1', ''));
    await s.runtime.endEdits();
    expect(titleOf(s.state().work, 'l1')).toBe('Lesson l1');
    expect(s.state().turns).toEqual([]);

    // Kept, then typed back: the session file goes back too, and the note goes.
    s.runtime.edit(retitle('l1', 'Why Git'));
    await s.runtime.keepEdits();
    expect(s.noted()).toBe(true);
    s.runtime.edit(retitle('l1', 'Lesson l1'));
    await s.runtime.endEdits();
    expect(s.state().turns).toEqual([]);
    expect(s.state().handEdits).toBeNull();
    expect(titleOf(s.disk().work, 'l1')).toBe('Lesson l1');
    expect(s.noted()).toBe(false);
    expect(s.chat()).toEqual([]);
    // Nothing open: ending again does nothing.
    await s.runtime.endEdits();
    expect(s.state().turns).toEqual([]);
  });

  it('logs a session file it could not put back when the edits came to nothing', async () => {
    let fail = false;
    const s = await setup({
      store: (store) => ({
        ...store,
        save: (session) => (fail ? Promise.reject(FAILED) : store.save(session)),
      }),
    });
    await s.runtime.open();
    s.runtime.edit(retitle('l1', 'Why Git'));
    await s.runtime.keepEdits();
    s.runtime.edit(retitle('l1', 'Lesson l1'));
    fail = true;
    await s.runtime.endEdits();
    expect(log.warn).toHaveBeenCalledWith('Session hand edits not saved', {
      sessionId: 's1',
      reason: 'failed',
    });
    expect(s.state().handEdits).toBeNull();
    expect(titleOf(s.state().work, 'l1')).toBe('Lesson l1');
  });

  it('stays waiting when an edit lands while the last one is written', async () => {
    let release: () => void = () => undefined;
    const s = await setup({
      store: (store) => ({
        ...store,
        save: async (session) => {
          await new Promise<void>((resolve) => (release = resolve));
          return store.save(session);
        },
      }),
    });
    await s.runtime.open();
    s.runtime.edit(retitle('l1', 'Why Git'));
    const kept = s.runtime.keepEdits();
    await vi.waitFor(() => expect(s.state().handEdits?.state).toBe('saving'));
    s.runtime.edit(retitle('l1', 'Why Git, really'));
    release();
    expect(await kept).toBe(false);
    expect(s.state().handEdits?.state).toBe('dirty');
  });

  it('says when the edits could not be written, and keeps them in memory', async () => {
    const s = await setup({
      store: (store) => ({ ...store, saveHandEdits: () => Promise.reject(FAILED) }),
    });
    await s.runtime.open();
    s.runtime.edit(retitle('l1', 'Why Git'));
    expect(await s.runtime.keepEdits()).toBe(false);
    expect(s.state().handEdits?.state).toBe('error');
    expect(titleOf(s.state().work, 'l1')).toBe('Why Git');
    expect(log.warn).toHaveBeenCalledWith('Session hand edits not saved', {
      sessionId: 's1',
      reason: 'failed',
    });
  });

  it('keeps a hand-edit turn it could not write, for the next turn or Undo', async () => {
    let fail = true;
    const s = await setup({
      store: (store) => ({
        ...store,
        saveTurn: (...args) => (fail ? Promise.reject(FAILED) : store.saveTurn(...args)),
      }),
    });
    await s.runtime.open();
    s.runtime.edit(retitle('l1', 'Why Git'));
    await s.runtime.keepEdits();
    await s.runtime.endEdits();
    expect(s.state().problem?.code).toBe('not_saved');
    expect(s.state().unsaved).toMatchObject({ by: 'educator', changes: 1 });
    expect(s.state().canUndo).toBe(true);
    expect(s.noted()).toBe(true);
    expect(log.error).toHaveBeenCalledWith(
      'Session hand edits not saved as a turn',
      FAILED,
      expect.objectContaining({ sessionId: 's1' }),
    );

    // The next agent turn written counts them, and the note goes.
    fail = false;
    await agentTurn(s, 'Git basics');
    expect(s.state().unsaved).toBeNull();
    expect(s.state().turns.map((t) => [t.by, t.changes])).toEqual([['agent', 2]]);
    expect(s.noted()).toBe(false);
  });

  it('takes an unwritten hand-edit turn back with Undo, and removes the note', async () => {
    let fail = true;
    const s = await setup({
      store: (store) => ({
        ...store,
        saveTurn: (...args) => (fail ? Promise.reject(FAILED) : store.saveTurn(...args)),
      }),
    });
    await s.runtime.open();
    s.runtime.edit(retitle('l1', 'Why Git'));
    await s.runtime.keepEdits();
    await s.runtime.endEdits();
    fail = false;
    expect(await s.runtime.undo()).toBe(true);
    expect(titleOf(s.state().work, 'l1')).toBe('Lesson l1');
    expect(titleOf(s.disk().work, 'l1')).toBe('Lesson l1');
    expect(s.noted()).toBe(false);
  });

  it('logs a note it could not remove, and tries again after the next turn', async () => {
    let fail = true;
    const s = await setup({
      store: (store) => ({
        ...store,
        clearHandEdits: (id) => (fail ? Promise.reject(FAILED) : store.clearHandEdits(id)),
      }),
    });
    await s.runtime.open();
    s.runtime.edit(retitle('l1', 'Why Git'));
    await s.runtime.keepEdits();
    await s.runtime.endEdits();
    expect(s.state().turns).toHaveLength(1);
    expect(s.noted()).toBe(true);
    expect(log.warn).toHaveBeenCalledWith('Session hand edit note not removed', {
      sessionId: 's1',
      reason: 'failed',
    });
    fail = false;
    await agentTurn(s, 'Git basics');
    expect(s.noted()).toBe(false);
  });

  it('makes hand edits the app closed on a turn when the session opens again', async () => {
    const s = await setup({
      files: async (store, session) => {
        await store.saveHandEdits('s1', { since: T0.toISOString(), before: session.work });
        const edited = retitle('l1', 'Why Git')(session.work as Working);
        await store.save({ ...session, work: edited });
      },
    });
    await s.runtime.open();
    expect(s.state().status).toBe('ready');
    expect(s.state().turns).toMatchObject([{ by: 'educator', changes: 1 }]);
    expect(s.noted()).toBe(false);
    expect(titleOf(s.state().work, 'l1')).toBe('Why Git');
    // Before the agent started.
    expect(s.agent.start).toHaveBeenCalledTimes(1);
  });

  it('opens as usual when the note cannot be read', async () => {
    const s = await setup({
      store: (store) => ({ ...store, readHandEdits: () => Promise.reject(FAILED) }),
    });
    await s.runtime.open();
    expect(s.state().status).toBe('ready');
    expect(log.warn).toHaveBeenCalledWith('Session hand edits not recovered', {
      sessionId: 's1',
      reason: 'failed',
    });
  });

  it('makes open hand edits their own turn before a turn the page did not start', async () => {
    const s = await setup();
    await s.runtime.open();
    s.runtime.edit(retitle('l1', 'Why Git'));
    // The agent speaks on its own: a turn already running when the page opened.
    expect(await s.call('set_course_details', { title: 'Git basics' })).toEqual({
      text: 'Updated title.',
    });
    expect(s.state().canEdit).toBe(false);
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await s.runtime.settled();
    expect(s.state().turns.map((t) => [t.by, t.changes])).toEqual([
      ['educator', 1],
      ['agent', 1],
    ]);
  });
});

describe('what the agent is told after the runtime ends', () => {
  it('tells a new runtime’s agent of hand edits made before it, once', async () => {
    const s = await setup();
    await s.runtime.open();
    s.runtime.edit(retitle('l1', 'Why Git'));
    await s.runtime.endEdits();
    expect(JSON.parse(s.note() as string)).toEqual({ undone: 0, handEdited: true });
    s.runtime.dispose();

    const next = await s.reopen();
    expect(await next.send('Shorten it.')).toBe(true);
    expect(s.agent.send).toHaveBeenLastCalledWith('s1', `${HAND_EDIT_NOTE}Shorten it.`);
    await next.settled();
    expect(s.note()).toBeUndefined();
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await next.settled();
    next.dispose();

    const third = await s.reopen();
    expect(await third.send('Go on.')).toBe(true);
    expect(s.agent.send).toHaveBeenLastCalledWith('s1', 'Go on.');
  });

  it('tells a new runtime’s agent of turns undone before it', async () => {
    const s = await setup();
    await s.runtime.open();
    await agentTurn(s, 'Git basics');
    expect(await s.runtime.undo()).toBe(true);
    s.runtime.dispose();

    const next = await s.reopen();
    expect(await next.send('Go on.')).toBe(true);
    expect(s.agent.send).toHaveBeenLastCalledWith('s1', `${undoNote(1)}Go on.`);
  });

  it('logs a note it could not write or read, and still tells this runtime’s agent', async () => {
    const s = await setup({
      store: (store) => ({
        ...store,
        saveAgentNote: () => Promise.reject(FAILED),
        readAgentNote: () => Promise.reject(FAILED),
      }),
    });
    await s.runtime.open();
    expect(log.warn).toHaveBeenCalledWith('Session agent note not read', {
      sessionId: 's1',
      reason: 'failed',
    });
    expect(s.state().status).toBe('ready');
    s.runtime.edit(retitle('l1', 'Why Git'));
    await s.runtime.endEdits();
    expect(log.warn).toHaveBeenCalledWith('Session agent note not saved', {
      sessionId: 's1',
      reason: 'failed',
    });
    expect(await s.runtime.send('Shorten it.')).toBe(true);
    expect(s.agent.send).toHaveBeenLastCalledWith('s1', `${HAND_EDIT_NOTE}Shorten it.`);
  });
});

describe('dropping edits the session cannot keep yet', () => {
  it('goes back to the last copy kept and keeps the visit open', async () => {
    const s = await setup();
    await s.runtime.open();
    // Nothing to drop before any hand edit.
    await s.runtime.dropIncomplete();
    expect(s.state().handEdits).toBeNull();

    s.runtime.edit(retitle('l1', 'Why Git'));
    expect(await s.runtime.keepEdits()).toBe(true);
    // Edits that pass the course schema are not dropped.
    await s.runtime.dropIncomplete();
    expect(titleOf(s.state().work, 'l1')).toBe('Why Git');

    s.runtime.edit(retitle('l2', ''));
    expect(await s.runtime.keepEdits()).toBe(false);
    await s.runtime.dropIncomplete();
    expect(titleOf(s.state().work, 'l2')).toBe('Lesson l2');
    expect(titleOf(s.state().work, 'l1')).toBe('Why Git');
    expect(s.state().handEdits?.state).toBe('saved');
    expect(s.state().turns).toEqual([]);

    s.runtime.edit(retitle('l2', 'Rebase'));
    await s.runtime.endEdits();
    expect(s.state().turns.map((t) => t.changes)).toEqual([2]);
  });

  it('goes back to the copy from before the edits when none was kept', async () => {
    const s = await setup();
    await s.runtime.open();
    s.runtime.edit(retitle('l1', ''));
    await s.runtime.dropIncomplete();
    expect(titleOf(s.state().work, 'l1')).toBe('Lesson l1');
    await s.runtime.endEdits();
    expect(s.state().turns).toEqual([]);
  });
});
