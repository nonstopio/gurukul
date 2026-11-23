import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { MAX_MESSAGE_LENGTH, MAX_TOOL_RESULT_LENGTH } from '@gurukul/desktop/bridge';
import { SESSION_CHECKPOINTS_KEPT } from '@gurukul/schema';
import type { AuthoringSession } from '@gurukul/schema';
import { TOOL_ACTIVITY, toolActivity } from '../src/studio/session/activity';
import {
  HAND_EDIT_NOTE,
  MESSAGE_MAX_LENGTH,
  TOOL_RESULT_MAX_LENGTH,
  appProblem,
  createAgentSession,
  problemOf,
  statusProblem,
  turnSummary,
  undoNote,
  yieldTo,
} from '../src/studio/session/agent';
import type { AgentSessionOptions } from '../src/studio/session/agent';
import {
  ATTACHMENT_LABEL_MAX,
  MAX_ATTACHMENTS,
  attachmentKey,
  attachmentNote,
} from '../src/studio/session/attachments';
import type { AttachTarget } from '../src/studio/session/attachments';
import { agentSetup } from '../src/studio/session/prompt';
import { START_CHECKPOINT, createSessionStore } from '../src/studio/session/store';
import { TOOLS } from '../src/studio/session/tools';
import type { Tool } from '../src/studio/session/tools';
import { TRANSCRIPT_FILE, parseTranscript } from '../src/studio/session/transcript';
import { makeCourse } from './fake-data';
import { AGENT_SESSION_ID, fakeAgent, fakeDesktop } from './fake-desktop';
import { draftDoc } from './fake-studio';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
const { log } = await import('../src/log');

const T0 = new Date('2026-11-19T10:00:00.000Z');
const REFUSED = new Error('Error invoking remote method: Error: Not allowed');
const OLD_APP = new Error('Error invoking remote method: Error: Not available in this version');

type Init = {
  kind?: 'new' | 'edit';
  edit?: (session: AuthoringSession) => AuthoringSession;
  agent?: Parameters<typeof fakeAgent>[1];
  options?: Partial<AgentSessionOptions>;
};

/** A session on disk, a fake bridge with a working agent, and the runtime over them (not opened). */
async function setup(init: Init = {}) {
  const fake = fakeDesktop();
  const agent = fakeAgent(fake.desktop, init.agent);
  const store = createSessionStore({
    desktop: fake.desktop,
    uid: 'u1',
    now: () => T0,
    newId: () => 's1',
  });
  const begun = await store.start(
    init.kind === 'new' ? { kind: 'new' } : { kind: 'edit', courseId: 'git' },
    async () => draftDoc(makeCourse(), { rev: 4 }),
  );
  if (begun.status !== 'started') throw new Error('not started');
  // The session as an earlier version started it: a goal, and the goal as its title.
  const goal = init.kind === 'new' ? 'A course on Git.' : 'Simplify chapter one.';
  const started = {
    ...begun,
    session: { ...begun.session, title: goal, goals: [{ text: goal, done: false }] },
  };
  await store.save(init.edit ? init.edit(started.session) : started.session);
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
  const changes = vi.fn();
  runtime.subscribe(changes);
  const disk = () => JSON.parse(fake.files.get('u1/s1/session.json') as string) as AuthoringSession;
  const chat = () => parseTranscript(fake.files.get(`u1/s1/${TRANSCRIPT_FILE}`) ?? '').entries;
  return { ...fake, ...agent, store, runtime, changes, disk, chat, state: runtime.getState };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** One whole turn: the message, a tool call that renames the course, then the turn's end. */
async function renameTurn(s: Setup, title: string, outcome: 'done' | 'stopped' = 'done') {
  expect(await s.runtime.send(`Rename the course to ${title}.`)).toBe(true);
  expect(await s.call('set_course_details', { title })).toEqual({ text: 'Updated title.' });
  s.emit({ type: 'turn_end', sessionId: 's1', agentSessionId: AGENT_SESSION_ID, outcome });
  await s.runtime.settled();
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('constants and words', () => {
  it('keeps the message and tool result limits within the shell’s', () => {
    expect(TOOL_RESULT_MAX_LENGTH).toBe(MAX_TOOL_RESULT_LENGTH);
    expect(MESSAGE_MAX_LENGTH + undoNote(SESSION_CHECKPOINTS_KEPT).length).toBeLessThanOrEqual(
      MAX_MESSAGE_LENGTH,
    );
  });

  it('has a plain-words activity line for every course tool, and a general one', () => {
    expect(Object.keys(TOOL_ACTIVITY).sort()).toEqual(TOOLS.map((t) => t.name).sort());
    for (const line of Object.values(TOOL_ACTIVITY)) expect(line).not.toMatch(/_/);
    expect(toolActivity('nothing_like_it')).toBe('Working on the course');
  });

  it('says what to do for each reason the agent cannot run', () => {
    expect(statusProblem({ state: 'ready', version: '2.1.328' })).toBeNull();
    expect(statusProblem({ state: 'not_signed_in', version: '2.1.328' })?.message).toBe(
      'Open a terminal, run `claude` and sign in, then try again.',
    );
    expect(statusProblem({ state: 'not_installed' })).toMatchObject({ code: 'not_installed' });
    expect(
      statusProblem({ state: 'too_old', version: '2.0.1', minimumVersion: '2.1.328' }),
    ).toMatchObject({ code: 'too_old', message: expect.stringContaining('2.0.1') });
    expect(problemOf({ code: 'plan_limit', resetsAt: null }).message).toMatch(/limit/);
    expect(problemOf({ code: 'crashed', exitCode: 1 }).message).toMatch(/Start it again/);
    expect(appProblem(OLD_APP)).toMatchObject({ code: 'app', reason: 'not_available' });
    expect(appProblem(REFUSED)).toMatchObject({ code: 'app', reason: 'refused' });
    expect(appProblem(OLD_APP).message).not.toBe(appProblem(REFUSED).message);
  });

  it('never names a product with Claude Code, only says the app runs it', () => {
    const words = [
      ...(['not_installed', 'not_signed_in'] as const).map((code) => problemOf({ code }).message),
      problemOf({ code: 'crashed', exitCode: null }).message,
    ].join(' ');
    expect(words).not.toMatch(/Claude Code (app|Studio)/);
  });

  it('writes a turn’s line from the message', () => {
    expect(turnSummary(null)).toBe('Carried on after the page reloaded');
    expect(turnSummary('  Add\na Quiz. ')).toBe('Add a Quiz.');
    const long = turnSummary(`${'word '.repeat(40)}end`);
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.endsWith('word…')).toBe(true);
    expect(turnSummary('x'.repeat(200))).toBe(`${'x'.repeat(119)}…`);
  });

  it('tells the agent how many turns were undone', () => {
    expect(undoNote(1)).toContain('your last turn.');
    expect(undoNote(3)).toContain('your last 3 turns.');
  });
});

describe('choosing the model', () => {
  it('changes nothing while a turn runs or before the agent is ready', async () => {
    const s = await setup();
    expect(await s.runtime.choose({ model: 'opus' })).toBe(false);
    await s.runtime.open();
    expect(s.state().canChoose).toBe(true);
    expect(await s.runtime.send('Hello')).toBe(true);
    expect(s.state().canChoose).toBe(false);
    expect(await s.runtime.choose({ model: 'opus' })).toBe(false);
    expect(s.agent.start).toHaveBeenCalledTimes(1);
    expect(s.disk()).not.toHaveProperty('model');
  });
});

describe('opening', () => {
  it('starts the agent with the prompt, skills and tools, and no resume id the first time', async () => {
    const s = await setup();
    expect(s.state().status).toBe('loading');
    await s.runtime.open();
    expect(s.agent.status).toHaveBeenCalledTimes(1);
    expect(s.agent.start).toHaveBeenCalledWith({
      uid: 'u1',
      sessionId: 's1',
      ...agentSetup(),
      resumeId: null,
    });
    const view = s.state();
    expect(view).toMatchObject({ status: 'ready', problem: null, canSend: true, canUndo: false });
    expect(view.work?.course.title).toBe('Git, the NonStop Way');
    expect(view.base).toEqual(view.work);
    expect(view.changes?.count).toBe(0);
    expect(view.turns).toEqual([]);
    expect(s.changes).toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith('Agent started', { sessionId: 's1', resumed: false });
  });

  it('resumes the Claude session the last finished turn named, and reads the chat back', async () => {
    const s = await setup({ edit: (x) => ({ ...x, agentSessionId: 'claude-old' }) });
    s.files.set(
      `u1/s1/${TRANSCRIPT_FILE}`,
      `${JSON.stringify({ kind: 'educator', turnId: 't0', at: T0.toISOString(), text: 'Hi' })}\nnot json\n`,
    );
    await s.runtime.open();
    expect(s.agent.start).toHaveBeenCalledWith(expect.objectContaining({ resumeId: 'claude-old' }));
    expect(s.state().transcript).toEqual([
      { kind: 'educator', turnId: 't0', at: T0.toISOString(), text: 'Hi' },
    ]);
    expect(log.warn).toHaveBeenCalledWith('Session transcript lines unreadable', {
      sessionId: 's1',
      count: 1,
    });
  });

  it('says so when the session is not on this computer', async () => {
    const s = await setup();
    s.files.delete('u1/s1/session.json');
    await s.runtime.open();
    expect(s.state().status).toBe('missing');
    expect(s.agent.status).not.toHaveBeenCalled();
  });

  it('shows a closed session without starting an agent', async () => {
    const s = await setup({ edit: (x) => ({ ...x, status: 'saved' }) });
    await s.runtime.open();
    expect(s.state()).toMatchObject({ status: 'closed', canSend: false });
    expect(s.state().work).not.toBeNull();
    expect(s.listening()).toBe(0);
    expect(s.agent.status).not.toHaveBeenCalled();
  });

  it('reports a session file the app could not read, and opens it on retry', async () => {
    const s = await setup();
    s.store.read = vi
      .fn()
      .mockRejectedValueOnce(REFUSED)
      .mockImplementation(createSessionStore({ desktop: s.desktop, uid: 'u1' }).read);
    await s.runtime.open();
    expect(s.state()).toMatchObject({ status: 'unavailable', problem: { code: 'app' } });
    expect(log.error).toHaveBeenCalledWith('Session not opened', REFUSED, { sessionId: 's1' });
    await s.runtime.retry();
    expect(s.state().status).toBe('ready');
  });

  it.each([
    [{ state: 'not_installed' } as const, 'not_installed'],
    [{ state: 'not_signed_in', version: '2.1.328' } as const, 'not_signed_in'],
    [{ state: 'too_old', version: '2.0.0', minimumVersion: '2.1.328' } as const, 'too_old'],
  ])('stops at agent.status %j', async (status, code) => {
    const s = await setup({ agent: { status } });
    await s.runtime.open();
    expect(s.state()).toMatchObject({ status: 'unavailable', problem: { code }, canSend: false });
    expect(s.agent.start).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith('Agent unavailable', { sessionId: 's1', reason: code });
  });

  it('reports why agent.start could not start it, and starts on retry', async () => {
    const s = await setup({ agent: { start: { ok: false, error: { code: 'not_signed_in' } } } });
    await s.runtime.open();
    expect(s.state()).toMatchObject({ status: 'unavailable', problem: { code: 'not_signed_in' } });
    s.agent.start.mockResolvedValueOnce({ ok: true, agentSessionId: AGENT_SESSION_ID });
    await s.runtime.retry();
    expect(s.state()).toMatchObject({ status: 'ready', problem: null });
  });

  it('reports a shell too old for the agent', async () => {
    const s = await setup();
    s.agent.status.mockRejectedValueOnce(OLD_APP);
    await s.runtime.open();
    expect(s.state().problem).toMatchObject({ code: 'app', reason: 'not_available' });
    expect(log.error).toHaveBeenCalledWith('Agent not started', OLD_APP, { sessionId: 's1' });
  });

  it('does nothing on retry unless the agent is unavailable', async () => {
    const s = await setup();
    await s.runtime.open();
    await s.runtime.retry();
    expect(s.agent.status).toHaveBeenCalledTimes(1);
  });

  it('does not listen when disposed while it was reading', async () => {
    const s = await setup();
    const opening = s.runtime.open();
    s.runtime.dispose();
    await opening;
    expect(s.listening()).toBe(0);
    expect(s.state().status).toBe('loading');
  });

  it('ignores another session’s events and tool calls, and stops listening when disposed', async () => {
    const s = await setup();
    await s.runtime.open();
    expect(s.listening()).toBe(2);
    s.emit({ type: 'text', sessionId: 'other', text: 'Hello' });
    void s.call('get_course', {}, 'other');
    await s.runtime.settled();
    expect(s.state()).toMatchObject({ status: 'ready', transcript: [] });
    expect(s.agent.toolResult).not.toHaveBeenCalled();
    s.runtime.dispose();
    expect(s.listening()).toBe(0);
  });
});

describe('sources', () => {
  it('makes the session’s Sources folder before the agent starts, named after the course', async () => {
    const s = await setup();
    s.agent.start.mockImplementationOnce(async () => {
      // The agent works in the folder, so it exists by the time `agent.start` is called.
      expect(s.desktop.sources.ensure).toHaveBeenCalledTimes(1);
      return { ok: true, agentSessionId: AGENT_SESSION_ID };
    });
    await s.runtime.open();
    expect(s.desktop.sources.ensure).toHaveBeenCalledWith({
      uid: 'u1',
      sessionId: 's1',
      suggestedName: 'git',
    });
    expect(s.agent.start).toHaveBeenCalledTimes(1);
  });

  it('names no folder for a new course, which has no address yet', async () => {
    const s = await setup({ kind: 'new' });
    await s.runtime.open();
    expect(s.desktop.sources.ensure).toHaveBeenCalledWith({ uid: 'u1', sessionId: 's1' });
  });

  it('starts the agent anyway when the folder cannot be made, and says so in the log', async () => {
    const s = await setup();
    s.desktop.sources.ensure.mockRejectedValueOnce(new Error('EACCES'));
    await s.runtime.open();
    expect(s.state().status).toBe('ready');
    expect(log.warn).toHaveBeenCalledWith('Sources folder not made', {
      sessionId: 's1',
      reason: 'failed',
    });
  });

  it('reads the session’s Sources folder through the bridge by default', async () => {
    const s = await setup();
    await s.runtime.open();
    expect(await s.runtime.send('Use my notes.')).toBe(true);
    expect(await s.call('list_sources', {})).toEqual({
      text: expect.stringContaining('Rebase notes.md') as unknown,
    });
    expect(await s.call('read_source', { name: 'Rebase notes.md' })).toEqual({
      text: expect.stringContaining('Text of Rebase notes.md') as unknown,
    });
    expect(s.desktop.sources.read).toHaveBeenCalledWith(
      { uid: 'u1', sessionId: 's1' },
      'Rebase notes.md',
    );
  });

  it('hands the shell a picture the agent reads, beside the text', async () => {
    const s = await setup();
    await s.runtime.open();
    await s.desktop.sources.add({ uid: 'u1', sessionId: 's1' }, [
      { name: 'Diagram.png', bytes: new Uint8Array([1]) },
    ]);
    expect(await s.runtime.send('Look at my diagram.')).toBe(true);
    expect(await s.call('read_source', { name: 'Diagram.png' })).toEqual({
      text: expect.stringContaining('Shown to you') as unknown,
      images: [{ data: 'AQID', mimeType: 'image/png' }],
    });
  });
});

describe('turns', () => {
  it('runs a turn: message, streamed reply, tool calls, then a checkpoint and the chat on disk', async () => {
    const s = await setup();
    await s.runtime.open();
    expect(await s.runtime.send('  Rename the course.  ')).toBe(true);
    expect(s.agent.send).toHaveBeenCalledWith('s1', 'Rename the course.');
    expect(s.state()).toMatchObject({ status: 'working', canSend: false, canStop: true });

    s.emit({ type: 'activity', sessionId: 's1', text: 'Loading the humanize skill' });
    expect(s.state().activity).toBe('Loading the humanize skill');
    s.emit({ type: 'tool_call', sessionId: 's1', callId: 'c1', name: 'set_course_details' });
    expect(s.state().activity).toBe('Changing the course details');
    expect(await s.call('set_course_details', { title: 'Git for teams' })).toEqual({
      text: 'Updated title.',
    });
    expect(s.state().work?.course.title).toBe('Git for teams');
    expect(s.state().turnChanges).toBe(1);
    expect(s.state().changes?.count).toBe(1);
    s.emit({ type: 'text', sessionId: 's1', text: 'I renamed it.' });
    // Nothing is written before the turn ends.
    expect(s.disk().work.course.title).toBe('Git, the NonStop Way');

    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await s.runtime.settled();
    const view = s.state();
    expect(view).toMatchObject({ status: 'ready', activity: null, turnChanges: 0, canUndo: true });
    expect(view.turns).toEqual([
      {
        id: 't1',
        at: T0.toISOString(),
        by: 'agent',
        summary: 'Rename the course.',
        checkpoint: 't1.json',
        changes: 1,
        parts: [{ kind: 'course', title: '', status: 'changed' }],
      },
    ]);
    const disk = s.disk();
    expect(disk.turns).toEqual(view.turns);
    expect(disk.agentSessionId).toBe(AGENT_SESSION_ID);
    expect(disk.work.course.title).toBe('Git for teams');
    const checkpoint = JSON.parse(s.files.get('u1/s1/checkpoints/t1.json') as string);
    expect(checkpoint.course.title).toBe('Git for teams');
    const start = JSON.parse(s.files.get(`u1/s1/checkpoints/${START_CHECKPOINT}`) as string);
    expect(start.course.title).toBe('Git, the NonStop Way');
    expect(s.chat().map((e) => [e.kind, e.text])).toEqual([
      ['educator', 'Rename the course.'],
      ['activity', 'Loading the humanize skill'],
      ['activity', 'Changing the course details'],
      ['agent', 'I renamed it.'],
    ]);
    expect(log.info).toHaveBeenCalledWith('Session turn saved', {
      sessionId: 's1',
      turnId: 't1',
      changes: 1,
      outcome: 'done',
    });
  });

  it('counts each turn against the checkpoint before it, and writes the start checkpoint once', async () => {
    const s = await setup();
    await s.runtime.open();
    await renameTurn(s, 'One');
    s.store.saveStart = vi.fn(s.store.saveStart);
    await renameTurn(s, 'One');
    await renameTurn(s, 'Two');
    expect(s.state().turns.map((t) => t.changes)).toEqual([1, 0, 1]);
    expect(s.store.saveStart).not.toHaveBeenCalled();
    expect(s.state().changes?.count).toBe(1);
  });

  it('refuses a message while busy, empty or too long', async () => {
    const s = await setup();
    expect(await s.runtime.send('Hello')).toBe(false);
    await s.runtime.open();
    expect(await s.runtime.send('   ')).toBe(false);
    expect(await s.runtime.send('x'.repeat(MESSAGE_MAX_LENGTH + 1))).toBe(false);
    expect(await s.runtime.send('First')).toBe(true);
    expect(await s.runtime.send('Second')).toBe(false);
    expect(s.agent.send).toHaveBeenCalledTimes(1);
  });

  it('keeps the message in the chat and says so when the app does not take it', async () => {
    const s = await setup();
    await s.runtime.open();
    s.agent.send.mockRejectedValueOnce(REFUSED);
    expect(await s.runtime.send('Hello')).toBe(false);
    expect(s.state()).toMatchObject({ status: 'ready', problem: { code: 'app' } });
    expect(s.state().transcript.map((e) => e.text)).toEqual(['Hello', 'Not sent.']);
    expect(await s.runtime.send('Again')).toBe(true);
    expect(s.state().problem).toBeNull();
  });

  it('answers a refused tool call with its sentence and leaves the working copy alone', async () => {
    const s = await setup();
    await s.runtime.open();
    await s.runtime.send('Rename it.');
    const answer = await s.call('set_course_details', {});
    expect(answer).toEqual({ error: 'Give at least one field to change.' });
    expect(await s.call('no_such_tool', {})).toEqual({
      error: 'There is no tool called "no_such_tool".',
    });
    expect(s.state().turnChanges).toBe(0);
  });

  it('runs tool calls one at a time, each on the result of the one before', async () => {
    const s = await setup();
    await s.runtime.open();
    await s.runtime.send('Two changes.');
    const [a, b] = await Promise.all([
      s.call('set_course_details', { title: 'Git A' }),
      s.call('set_landing', { description: 'New words.' }),
    ]);
    expect(a).toEqual({ text: 'Updated title.' });
    expect(b).toMatchObject({ text: expect.any(String) });
    expect(s.state().work?.course).toMatchObject({ title: 'Git A', description: 'New words.' });
    expect(s.state().turnChanges).toBe(2);
  });

  it('keeps the agent’s session fields (summary, goals, to-dos) from its tools', async () => {
    const s = await setup({ kind: 'new' });
    await s.runtime.open();
    expect(s.state().base).toBeNull();
    await s.runtime.send('Start.');
    await s.call('set_summary', { title: 'Git basics', summary: 'Wrote the outline.' });
    await s.call('add_todo', { text: 'Add a screenshot of the diff view.' });
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await s.runtime.settled();
    expect(s.disk()).toMatchObject({ title: 'Git basics', summary: 'Wrote the outline.' });
    expect(s.disk().todos).toHaveLength(1);
  });

  it('refuses a tool answer too long for the shell, without changing anything', async () => {
    const huge: Tool = {
      name: 'read_everything',
      description: 'Reads too much.',
      input: z.strictObject({}),
      run: (state) => ({
        state: { ...state, title: 'Changed' },
        text: 'x'.repeat(TOOL_RESULT_MAX_LENGTH + 1),
      }),
    };
    const s = await setup({ options: { tools: [huge] } });
    await s.runtime.open();
    expect(s.agent.start).toHaveBeenCalledWith(
      expect.objectContaining({ tools: [expect.objectContaining({ name: 'read_everything' })] }),
    );
    await s.runtime.send('Read it all.');
    expect(await s.call('read_everything', {})).toEqual({
      error: 'That answer is too long to send. Ask for less at a time: one lesson or one Quiz.',
    });
    expect(s.state().session?.title).toBe('Simplify chapter one.');
    expect(log.warn).toHaveBeenCalledWith('Session tool answer too long', {
      sessionId: 's1',
      tool: 'read_everything',
    });
  });

  it('logs a tool answer the shell no longer waits for', async () => {
    const s = await setup();
    await s.runtime.open();
    await s.runtime.send('Read it.');
    s.agent.toolResult.mockRejectedValueOnce(REFUSED);
    void s.call('get_course', {});
    await s.runtime.settled();
    expect(log.warn).toHaveBeenCalledWith('Session tool answer not delivered', {
      sessionId: 's1',
      tool: 'get_course',
      reason: 'refused',
    });
  });

  it('keeps a turn whose writes failed in memory, and counts it with the next one', async () => {
    const s = await setup();
    await s.runtime.open();
    s.store.saveTurn = vi.fn().mockRejectedValueOnce(REFUSED).mockImplementation(s.store.saveTurn);
    await renameTurn(s, 'One');
    expect(s.state()).toMatchObject({ status: 'ready', problem: { code: 'not_saved' }, turns: [] });
    expect(log.error).toHaveBeenCalledWith('Session turn not saved', REFUSED, {
      sessionId: 's1',
      turnId: 't1',
    });
    await s.runtime.send('Again.');
    expect(s.state().problem).toBeNull();
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await s.runtime.settled();
    expect(s.state().turns).toMatchObject([{ id: 't2', changes: 1 }]);
  });

  it('logs a chat that could not be written; the turn is still saved', async () => {
    const s = await setup();
    await s.runtime.open();
    s.store.writeTranscript = vi.fn().mockRejectedValue(REFUSED);
    await renameTurn(s, 'One');
    expect(s.state()).toMatchObject({ problem: null, turns: [{ id: 't1' }] });
    expect(log.warn).toHaveBeenCalledWith('Session transcript not saved', {
      sessionId: 's1',
      reason: 'refused',
    });
  });

  it('records the Claude session id of a turn end that had no turn, on disk too', async () => {
    const s = await setup();
    await s.runtime.open();
    s.emit({ type: 'turn_end', sessionId: 's1', agentSessionId: 'claude-2', outcome: 'stopped' });
    await s.runtime.settled();
    expect(s.state()).toMatchObject({ status: 'ready', turns: [] });
    expect(s.state().session?.agentSessionId).toBe('claude-2');
    expect(s.disk()).toMatchObject({ agentSessionId: 'claude-2', turns: [] });
    // The same id again is not written again.
    s.store.save = vi.fn(s.store.save);
    s.emit({ type: 'turn_end', sessionId: 's1', agentSessionId: 'claude-2', outcome: 'done' });
    await s.runtime.settled();
    expect(s.store.save).not.toHaveBeenCalled();
  });

  it('writes only the id when a turn that could not be written is followed by an id', async () => {
    const s = await setup();
    await s.runtime.open();
    s.store.saveTurn = vi.fn().mockRejectedValueOnce(REFUSED);
    await renameTurn(s, 'One');
    s.emit({ type: 'turn_end', sessionId: 's1', agentSessionId: 'claude-2', outcome: 'done' });
    await s.runtime.settled();
    expect(s.disk()).toMatchObject({ agentSessionId: 'claude-2', turns: [] });
    expect(s.disk().work.course.title).toBe('Git, the NonStop Way');
    expect(s.state().work?.course.title).toBe('One');
  });

  it('logs a Claude session id that could not be written, and keeps it in memory', async () => {
    const s = await setup();
    await s.runtime.open();
    s.store.save = vi.fn().mockRejectedValueOnce(REFUSED);
    s.emit({ type: 'turn_end', sessionId: 's1', agentSessionId: 'claude-2', outcome: 'done' });
    await s.runtime.settled();
    expect(s.state().session?.agentSessionId).toBe('claude-2');
    expect(s.disk().agentSessionId).toBeNull();
    expect(log.warn).toHaveBeenCalledWith('Session agent id not saved', {
      sessionId: 's1',
      reason: 'refused',
    });
  });
});

describe('attached parts of the course', () => {
  const block: AttachTarget = {
    kind: 'block',
    ids: { itemId: 'l1', blockId: 'b1' },
    label: 'Lesson 1.1 · Text block 1',
  };
  const question: AttachTarget = {
    kind: 'question',
    ids: { itemId: 'q1', questionId: 'q1a' },
    label: 'Quiz 1.2 · Question 1',
  };

  it('sends them with the next message, ids first, and keeps them with it in the chat', async () => {
    const s = await setup();
    expect(s.runtime.attach(block)).toBe(false);
    expect(s.state()).toMatchObject({ attachments: [], canAttach: false });
    await s.runtime.open();
    expect(s.state().canAttach).toBe(true);
    s.changes.mockClear();
    expect(s.runtime.attach(block)).toBe(true);
    expect(s.runtime.attach({ ...block, label: 'The same block' })).toBe(true);
    expect(s.runtime.attach(question)).toBe(true);
    expect(s.changes).toHaveBeenCalledTimes(2);
    expect(s.state().attachments).toEqual([block, question]);

    expect(await s.runtime.send('Make this shorter.')).toBe(true);
    expect(s.agent.send).toHaveBeenCalledWith(
      's1',
      `${attachmentNote([block, question])}Make this shorter.`,
    );
    expect(s.state().attachments).toEqual([]);
    expect(s.state().transcript[0]).toEqual({
      kind: 'educator',
      turnId: 't1',
      at: T0.toISOString(),
      text: 'Make this shorter.',
      attachments: [block, question],
    });
    // The turn's line is the Educator's words; the chat on disk keeps what was attached.
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await s.runtime.settled();
    expect(s.disk().turns[0]?.summary).toBe('Make this shorter.');
    expect(s.chat()[0]).toMatchObject({ attachments: [block, question] });
  });

  it('puts the note about undone turns before the attached parts', async () => {
    const s = await setup();
    await s.runtime.open();
    await renameTurn(s, 'One');
    expect(await s.runtime.undo()).toBe(true);
    s.runtime.attach(block);
    await s.runtime.send('Shorter.');
    expect(s.agent.send).toHaveBeenLastCalledWith(
      's1',
      `${undoNote(1)}${attachmentNote([block])}Shorter.`,
    );
  });

  it('sends no note and keeps no list when nothing is attached', async () => {
    const s = await setup();
    await s.runtime.open();
    await s.runtime.send('Hello');
    expect(s.agent.send).toHaveBeenCalledWith('s1', 'Hello');
    expect(s.state().transcript[0]).not.toHaveProperty('attachments');
  });

  it('can attach while a turn runs, for the message after it', async () => {
    const s = await setup();
    await s.runtime.open();
    await s.runtime.send('First.');
    expect(s.runtime.attach(block)).toBe(true);
    expect(s.state().attachments).toEqual([block]);
  });

  it('takes a part off by itself or by its key, and ignores one not attached', async () => {
    const s = await setup();
    await s.runtime.open();
    s.runtime.attach(block);
    s.runtime.attach(question);
    s.changes.mockClear();
    s.runtime.detach('course');
    expect(s.changes).not.toHaveBeenCalled();
    s.runtime.detach(block);
    expect(s.state().attachments).toEqual([question]);
    s.runtime.detach(attachmentKey(question));
    expect(s.state().attachments).toEqual([]);
  });

  it('takes a part off by the object it was attached with, its ids in any order', async () => {
    const s = await setup();
    await s.runtime.open();
    const reversed: AttachTarget = {
      kind: 'block',
      ids: { blockId: 'b1', itemId: 'l1' },
      label: 'Lesson 1.1 · Text block 1',
    };
    expect(s.runtime.attach(reversed)).toBe(true);
    expect(s.runtime.attach(block)).toBe(true);
    expect(s.state().attachments).toHaveLength(1);
    s.runtime.detach(reversed);
    expect(s.state().attachments).toEqual([]);
  });

  it('refuses past the limit, and ids that are not ids, but cuts a long label', async () => {
    const s = await setup();
    await s.runtime.open();
    for (let i = 0; i < MAX_ATTACHMENTS; i += 1) {
      expect(
        s.runtime.attach({ kind: 'chapter', ids: { chapterId: `c${i}` }, label: `Chapter ${i}` }),
      ).toBe(true);
    }
    expect(s.state().canAttach).toBe(false);
    expect(s.runtime.attach(block)).toBe(false);
    // One already attached is still attached.
    expect(s.runtime.attach({ kind: 'chapter', ids: { chapterId: 'c0' }, label: 'Again' })).toBe(
      true,
    );
    s.runtime.detach('chapter:c0');
    expect(s.runtime.attach({ ...block, ids: { itemId: 'l1', blockId: '' } })).toBe(false);
    expect(s.runtime.attach({ ...block, label: `Lesson ${'x'.repeat(200)}` })).toBe(true);
    expect(s.state().attachments.at(-1)?.label).toHaveLength(ATTACHMENT_LABEL_MAX);
  });

  it('keeps them when the app does not take the message, with any attached meanwhile', async () => {
    const s = await setup();
    await s.runtime.open();
    s.runtime.attach(block);
    let refuse: (error: Error) => void = () => undefined;
    s.agent.send.mockImplementationOnce(
      () => new Promise<undefined>((_, reject) => (refuse = reject)),
    );
    const sending = s.runtime.send('Shorter.');
    expect(s.state().attachments).toEqual([]);
    s.runtime.attach(question);
    s.runtime.attach(block);
    refuse(REFUSED);
    expect(await sending).toBe(false);
    expect(s.state().attachments).toEqual([block, question]);
  });

  it('is not offered for a closed session', async () => {
    const s = await setup({ edit: (x) => ({ ...x, status: 'discarded' }) });
    await s.runtime.open();
    expect(s.state().canAttach).toBe(false);
    expect(s.runtime.attach(block)).toBe(false);
  });

  it('stays under the shell’s message limit with the most a message can carry', () => {
    const id = 'i'.repeat(80);
    const most = Array.from({ length: MAX_ATTACHMENTS }, (): AttachTarget => ({
      kind: 'question',
      ids: { itemId: id, questionId: id },
      label: 'x'.repeat(ATTACHMENT_LABEL_MAX),
    }));
    expect(
      MESSAGE_MAX_LENGTH +
        undoNote(SESSION_CHECKPOINTS_KEPT).length +
        HAND_EDIT_NOTE.length +
        attachmentNote(most).length,
    ).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
  });
});

describe('stop', () => {
  it('ends the turn and keeps what it had changed as its checkpoint', async () => {
    const s = await setup();
    await s.runtime.open();
    await s.runtime.stop();
    expect(s.agent.stop).not.toHaveBeenCalled();
    await s.runtime.send('Rename it.');
    await s.call('set_course_details', { title: 'Half done' });
    await s.runtime.stop();
    expect(s.agent.stop).toHaveBeenCalledWith('s1');
    expect(s.state()).toMatchObject({ status: 'stopping', canStop: false });
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'stopped',
    });
    await s.runtime.settled();
    expect(s.state()).toMatchObject({ status: 'ready', turns: [{ id: 't1', changes: 1 }] });
    expect(s.disk().work.course.title).toBe('Half done');
    expect(s.chat().at(-1)).toMatchObject({
      kind: 'notice',
      turnId: 't1',
      text: 'Stopped. What this turn had changed is kept.',
    });
  });

  it('keeps working when the app did not take Stop', async () => {
    const s = await setup();
    await s.runtime.open();
    await s.runtime.send('Rename it.');
    s.agent.stop.mockRejectedValueOnce(REFUSED);
    await s.runtime.stop();
    expect(s.state()).toMatchObject({ status: 'working', problem: { code: 'app' } });
    expect(log.warn).toHaveBeenCalledWith('Agent not stopped', {
      sessionId: 's1',
      reason: 'refused',
    });
  });

  it('leaves a turn that ended meanwhile ended when Stop fails', async () => {
    const s = await setup();
    await s.runtime.open();
    await s.runtime.send('Rename it.');
    s.agent.stop.mockImplementationOnce(async () => {
      s.emit({
        type: 'turn_end',
        sessionId: 's1',
        agentSessionId: AGENT_SESSION_ID,
        outcome: 'done',
      });
      await s.runtime.settled();
      throw REFUSED;
    });
    await s.runtime.stop();
    expect(s.state()).toMatchObject({ status: 'ready', turns: [{ id: 't1' }] });
  });
});

describe('agent errors', () => {
  it('waits at a plan limit: the turn ends failed and the next message clears it', async () => {
    const s = await setup();
    await s.runtime.open();
    await s.runtime.send('Rename it.');
    await s.call('set_course_details', { title: 'Before the limit' });
    s.emit({
      type: 'error',
      sessionId: 's1',
      error: { code: 'plan_limit', resetsAt: '2026-11-19T15:00:00Z' },
    });
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'failed',
    });
    await s.runtime.settled();
    expect(s.state()).toMatchObject({
      status: 'ready',
      problem: { code: 'plan_limit', resetsAt: '2026-11-19T15:00:00Z' },
      turns: [{ id: 't1', changes: 1 }],
    });
    expect(
      s
        .chat()
        .slice(-2)
        .map((e) => e.text),
    ).toEqual([
      problemOf({ code: 'plan_limit', resetsAt: null }).message,
      'This turn did not finish. What it had changed is kept.',
    ]);
    expect(log.warn).toHaveBeenCalledWith('Agent plan limit', { sessionId: 's1' });
    await s.runtime.send('Try again.');
    expect(s.state().problem).toBeNull();
  });

  it('ends a turn the agent left open when it crashes, and starts it again on retry', async () => {
    const s = await setup();
    await s.runtime.open();
    await s.runtime.send('Rename it.');
    await s.call('set_course_details', { title: 'Before the crash' });
    s.emit({ type: 'error', sessionId: 's1', error: { code: 'crashed', exitCode: 1 } });
    await s.runtime.settled();
    expect(s.state()).toMatchObject({
      status: 'unavailable',
      problem: { code: 'crashed', exitCode: 1 },
      activity: null,
      turns: [{ id: 't1', changes: 1 }],
      canSend: false,
    });
    // No turn ever finished before, so there is still no Claude session to resume.
    expect(s.disk().agentSessionId).toBeNull();
    expect(s.disk().work.course.title).toBe('Before the crash');
    await s.runtime.retry();
    expect(s.agent.start).toHaveBeenLastCalledWith(expect.objectContaining({ resumeId: null }));
    expect(s.state().status).toBe('ready');
  });

  it('goes unavailable on a crash between turns, keeping the session id to resume', async () => {
    const s = await setup();
    await s.runtime.open();
    await renameTurn(s, 'One');
    s.emit({ type: 'error', sessionId: 's1', error: { code: 'crashed', exitCode: null } });
    await s.runtime.settled();
    expect(s.state()).toMatchObject({ status: 'unavailable', turns: [{ id: 't1' }] });
    expect(s.state().transcript.at(-1)).toMatchObject({ kind: 'notice', turnId: null });
    await s.runtime.retry();
    expect(s.agent.start).toHaveBeenLastCalledWith(
      expect.objectContaining({ resumeId: AGENT_SESSION_ID }),
    );
  });

  it('records the turn end that follows a sign-in failure without a second turn', async () => {
    const s = await setup();
    await s.runtime.open();
    await s.runtime.send('Hello');
    s.emit({ type: 'error', sessionId: 's1', error: { code: 'not_signed_in' } });
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'failed',
    });
    await s.runtime.settled();
    expect(s.state()).toMatchObject({
      status: 'unavailable',
      problem: { code: 'not_signed_in' },
      turns: [{ id: 't1', changes: 0 }],
    });
    expect(s.state().session?.agentSessionId).toBe(AGENT_SESSION_ID);
    // On disk too: the next open resumes that chat, and the clean-up can remove Claude Code's copy.
    expect(s.disk()).toMatchObject({ agentSessionId: AGENT_SESSION_ID, turns: [{ id: 't1' }] });
  });
});

describe('a turn already running when the page opened', () => {
  it('adopts it from its first event and writes it at its end', async () => {
    const s = await setup();
    await s.runtime.open();
    s.emit({ type: 'text', sessionId: 's1', text: 'Still working.' });
    expect(s.state()).toMatchObject({ status: 'working', canStop: true });
    await s.call('set_course_details', { title: 'Carried on' });
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await s.runtime.settled();
    expect(s.state().turns).toMatchObject([
      { id: 't1', summary: 'Carried on after the page reloaded', changes: 1 },
    ]);
  });

  it('keeps the Educator’s message when the page reloads mid-turn, and the turn under it', async () => {
    const s = await setup();
    await s.runtime.open();
    expect(await s.runtime.send('Shorten lesson one.')).toBe(true);
    await s.runtime.settled();
    // The page reloads before the agent has finished: this runtime goes, a new one opens.
    s.runtime.dispose();
    expect(s.chat()).toMatchObject([
      { kind: 'educator', turnId: 't1', text: 'Shorten lesson one.' },
    ]);
    const reloaded = createAgentSession({
      desktop: s.desktop,
      uid: 'u1',
      sessionId: 's1',
      store: s.store,
      now: () => T0,
      newId: () => 'r1',
    });
    await reloaded.open();
    expect(reloaded.getState().transcript).toMatchObject([
      { kind: 'educator', text: 'Shorten lesson one.' },
    ]);
    s.emit({ type: 'text', sessionId: 's1', text: 'Shortened it.' });
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await reloaded.settled();
    expect(reloaded.getState().turns).toMatchObject([{ id: 't1', summary: 'Shorten lesson one.' }]);
    expect(s.chat()).toMatchObject([
      { kind: 'educator', turnId: 't1', text: 'Shorten lesson one.' },
      { kind: 'agent', turnId: 't1', text: 'Shortened it.' },
    ]);
  });

  it('does not take a message already written as a turn for the turn it adopts', async () => {
    const s = await setup();
    await s.runtime.open();
    await renameTurn(s, 'Git basics');
    await s.call('set_course_details', { title: 'Carried on' });
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await s.runtime.settled();
    expect(s.state().turns).toMatchObject([
      { id: 't1', summary: 'Rename the course to Git basics.' },
      { id: 't2', summary: 'Carried on after the page reloaded' },
    ]);
  });

  it('does not take a message whose turn was not written for the turn it adopts', async () => {
    const s = await setup();
    await s.runtime.open();
    s.store.saveTurn = vi.fn(async () => {
      throw REFUSED;
    });
    await renameTurn(s, 'Git basics');
    expect(s.state().unsaved).toMatchObject({ id: 't1' });
    s.emit({ type: 'text', sessionId: 's1', text: 'More.' });
    expect(s.state().transcript.at(-1)).toMatchObject({ kind: 'agent', turnId: 't2' });
  });

  it('does not take an undone turn’s message when the newest one never reached the disk', async () => {
    const s = await setup();
    await s.runtime.open();
    await renameTurn(s, 'Git basics');
    expect(await s.runtime.undo()).toBe(true);
    expect(s.state().turns).toEqual([]);
    // The chat write made when the next message is sent fails; the page then reloads mid-turn.
    const write = s.store.writeTranscript;
    s.store.writeTranscript = vi.fn().mockRejectedValue(REFUSED);
    expect(await s.runtime.send('Add a Quiz on rebase.')).toBe(true);
    await s.runtime.settled();
    s.runtime.dispose();
    s.store.writeTranscript = write;
    const reloaded = createAgentSession({
      desktop: s.desktop,
      uid: 'u1',
      sessionId: 's1',
      store: s.store,
      now: () => T0,
      newId: () => 'r1',
    });
    await reloaded.open();
    s.emit({ type: 'text', sessionId: 's1', text: 'Added the Quiz.' });
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await reloaded.settled();
    // Not the undone turn's id or words: the page cannot know the message, and says so.
    expect(reloaded.getState().turns).toMatchObject([
      { id: 'r1', summary: 'Carried on after the page reloaded' },
    ]);
    expect(s.chat()).toMatchObject([
      { kind: 'educator', turnId: 't1', text: 'Rename the course to Git basics.' },
      { kind: 'notice', turnId: 't1', text: expect.stringMatching(/^Turn undone/) },
      { kind: 'agent', turnId: 'r1', text: 'Added the Quiz.' },
    ]);
  });

  it('stays unavailable when a turn adopted while the agent could not run ends', async () => {
    const s = await setup({ agent: { status: { state: 'not_signed_in', version: '2.1.328' } } });
    await s.runtime.open();
    expect(s.state()).toMatchObject({ status: 'unavailable', problem: { code: 'not_signed_in' } });
    expect(await s.call('set_course_details', { title: 'Carried on' })).toEqual({
      text: 'Updated title.',
    });
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await s.runtime.settled();
    expect(s.state()).toMatchObject({
      status: 'unavailable',
      problem: { code: 'not_signed_in' },
      turns: [{ id: 't1', changes: 1 }],
      canSend: false,
      canUndo: false,
    });
    s.agent.status.mockResolvedValueOnce({ state: 'ready', version: '2.1.328' });
    await s.runtime.retry();
    expect(s.state()).toMatchObject({ status: 'ready', problem: null, canSend: true });
  });

  it('adopts a tool call that arrives first', async () => {
    const s = await setup();
    await s.runtime.open();
    await s.call('set_course_details', { title: 'Carried on' });
    expect(s.state()).toMatchObject({ status: 'working', turnChanges: 1 });
  });

  it('adopts events that arrive while the agent is starting', async () => {
    const s = await setup();
    s.agent.start.mockImplementationOnce(async () => {
      s.emit({ type: 'activity', sessionId: 's1', text: 'Thinking' });
      return { ok: true, agentSessionId: AGENT_SESSION_ID };
    });
    await s.runtime.open();
    expect(s.state()).toMatchObject({ status: 'working', activity: 'Thinking' });
  });

  it('writes a turn that ends while the agent is starting, then is ready', async () => {
    const s = await setup();
    s.agent.start.mockImplementationOnce(async () => {
      s.emit({ type: 'text', sessionId: 's1', text: 'Done.' });
      s.emit({
        type: 'turn_end',
        sessionId: 's1',
        agentSessionId: AGENT_SESSION_ID,
        outcome: 'done',
      });
      await s.runtime.settled();
      expect(s.state().status).toBe('connecting');
      return { ok: true, agentSessionId: AGENT_SESSION_ID };
    });
    await s.runtime.open();
    expect(s.state()).toMatchObject({ status: 'ready', turns: [{ id: 't1', changes: 0 }] });
  });
});

describe('undo', () => {
  it('restores the checkpoint before the newest turn, newest first, back to the start', async () => {
    const s = await setup();
    await s.runtime.open();
    expect(await s.runtime.undo()).toBe(false);
    await renameTurn(s, 'One');
    await renameTurn(s, 'Two');
    expect(s.files.has('u1/s1/checkpoints/t2.json')).toBe(true);

    expect(await s.runtime.undo()).toBe(true);
    expect(s.state()).toMatchObject({ status: 'ready', turns: [{ id: 't1' }], canUndo: true });
    expect(s.state().work?.course.title).toBe('One');
    expect(s.disk().work.course.title).toBe('One');
    expect(s.files.has('u1/s1/checkpoints/t2.json')).toBe(false);
    expect(s.chat().at(-1)).toMatchObject({
      kind: 'notice',
      turnId: 't2',
      text: 'Turn undone: the course is back as it was before it.',
    });

    expect(await s.runtime.undo()).toBe(true);
    expect(s.state()).toMatchObject({ turns: [], canUndo: false });
    expect(s.state().work?.course.title).toBe('Git, the NonStop Way');
    expect(s.state().changes?.count).toBe(0);
    expect(log.info).toHaveBeenCalledWith('Session turn undone', { sessionId: 's1', turnId: 't1' });

    // The agent hears about it once, with its next message.
    await s.runtime.send('Try a shorter title.');
    expect(s.agent.send).toHaveBeenLastCalledWith('s1', `${undoNote(2)}Try a shorter title.`);
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await s.runtime.settled();
    await s.runtime.send('Thanks.');
    expect(s.agent.send).toHaveBeenLastCalledWith('s1', 'Thanks.');
  });

  it('cannot undo past the checkpoints still kept', async () => {
    const s = await setup();
    await s.runtime.open();
    await renameTurn(s, 'One');
    await renameTurn(s, 'Two');
    s.files.delete('u1/s1/checkpoints/t1.json');
    expect(await s.runtime.undo()).toBe(false);
    expect(s.state()).toMatchObject({
      status: 'ready',
      problem: { code: 'undo_unavailable' },
      turns: [{ id: 't1' }, { id: 't2' }],
    });
  });

  it('says so when the undo could not be written', async () => {
    const s = await setup();
    await s.runtime.open();
    await renameTurn(s, 'One');
    s.store.undoTurn = vi.fn().mockRejectedValue(REFUSED);
    expect(await s.runtime.undo()).toBe(false);
    expect(s.state()).toMatchObject({
      status: 'ready',
      problem: { code: 'app' },
      turns: [{ id: 't1' }],
    });
    expect(log.error).toHaveBeenCalledWith('Session turn not undone', REFUSED, {
      sessionId: 's1',
      turnId: 't1',
    });
  });

  it('takes back a turn that could not be written, and only that one', async () => {
    const s = await setup();
    await s.runtime.open();
    await renameTurn(s, 'One');
    s.store.saveTurn = vi.fn().mockRejectedValueOnce(REFUSED);
    await renameTurn(s, 'Two');
    expect(s.state()).toMatchObject({
      status: 'ready',
      problem: { code: 'not_saved' },
      turns: [{ id: 't1' }],
      canUndo: true,
    });
    expect(s.state().work?.course.title).toBe('Two');

    expect(await s.runtime.undo()).toBe(true);
    expect(s.state()).toMatchObject({ status: 'ready', problem: null, turns: [{ id: 't1' }] });
    expect(s.state().work?.course.title).toBe('One');
    expect(s.disk()).toMatchObject({ turns: [{ id: 't1' }] });
    expect(s.disk().work.course.title).toBe('One');
    expect(s.chat().at(-1)).toMatchObject({ kind: 'notice', turnId: 't2' });
    expect(log.info).toHaveBeenCalledWith('Session turn undone', { sessionId: 's1', turnId: 't2' });

    // The saved turn is next, and the agent hears of the one undone.
    expect(await s.runtime.undo()).toBe(true);
    expect(s.state().work?.course.title).toBe('Git, the NonStop Way');
    await s.runtime.send('Shorter.');
    expect(s.agent.send).toHaveBeenLastCalledWith('s1', `${undoNote(2)}Shorter.`);
  });

  it('takes back a first turn that could not be written', async () => {
    const s = await setup();
    await s.runtime.open();
    s.store.saveTurn = vi.fn().mockRejectedValueOnce(REFUSED);
    await renameTurn(s, 'One');
    expect(s.state()).toMatchObject({ turns: [], canUndo: true });
    expect(await s.runtime.undo()).toBe(true);
    expect(s.state()).toMatchObject({ turns: [], canUndo: false });
    expect(s.state().work?.course.title).toBe('Git, the NonStop Way');
    expect(s.state().changes?.count).toBe(0);
  });

  it('keeps a turn that could not be written when taking it back fails too', async () => {
    const s = await setup();
    await s.runtime.open();
    s.store.saveTurn = vi.fn().mockRejectedValueOnce(REFUSED);
    await renameTurn(s, 'One');
    s.store.save = vi.fn().mockRejectedValueOnce(REFUSED);
    expect(await s.runtime.undo()).toBe(false);
    expect(s.state()).toMatchObject({ status: 'ready', problem: { code: 'app' }, canUndo: true });
    expect(s.state().work?.course.title).toBe('One');
    expect(log.error).toHaveBeenCalledWith('Session turn not undone', REFUSED, {
      sessionId: 's1',
      turnId: 't1',
    });
  });

  it('carries on with a turn the agent was already in when undo finishes', async () => {
    const s = await setup();
    await s.runtime.open();
    await renameTurn(s, 'One');
    const undoing = s.runtime.undo();
    s.emit({ type: 'text', sessionId: 's1', text: 'Still here.' });
    expect(await undoing).toBe(true);
    expect(s.state()).toMatchObject({ status: 'working', canStop: true });
  });

  it('is busy while it writes', async () => {
    const s = await setup();
    await s.runtime.open();
    await renameTurn(s, 'One');
    expect(s.runtime.busy()).toBe(false);
    const undoing = s.runtime.undo();
    expect(s.state().status).toBe('undoing');
    expect(s.runtime.busy()).toBe(true);
    await undoing;
    expect(s.runtime.busy()).toBe(false);
  });
});

describe('Review’s fields', () => {
  it('writes the summary, the goals and the Viewed ticks to the session file at once', async () => {
    const s = await setup();
    await s.runtime.open();
    const goals = [{ text: 'Simplify chapter one.', done: true }];
    expect(
      await s.runtime.updateReview({ summary: 'Shorter.', goals, viewed: ['lesson:l1'] }),
    ).toBe(true);
    expect(s.state().session).toMatchObject({ summary: 'Shorter.', goals, viewed: ['lesson:l1'] });
    expect(s.disk()).toMatchObject({ summary: 'Shorter.', goals, viewed: ['lesson:l1'] });
    expect(s.state().work).toEqual(s.state().base);
  });

  it('keeps them through a turn running meanwhile, and writes the turn with them', async () => {
    const s = await setup();
    await s.runtime.open();
    expect(await s.runtime.send('Rename the course.')).toBe(true);
    await s.call('set_course_details', { title: 'Mid-turn' });
    expect(await s.runtime.updateReview({ viewed: ['course:course'] })).toBe(true);
    // The file holds the tick, not the turn's unfinished work.
    expect(s.disk()).toMatchObject({ viewed: ['course:course'], turns: [] });
    expect(s.disk().work.course.title).toBe('Git, the NonStop Way');
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await s.runtime.settled();
    expect(s.disk()).toMatchObject({ viewed: ['course:course'], turns: [{ id: 't1' }] });
    expect(s.disk().work.course.title).toBe('Mid-turn');
  });

  /** Holds `method` open until `release`; `entered` resolves once it was called. */
  function hold<K extends 'saveTurn' | 'undoTurn'>(s: Setup, method: K) {
    const real = s.store[method].bind(s.store) as (...args: unknown[]) => Promise<AuthoringSession>;
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const reached = new Promise<void>((resolve) => (entered = resolve));
    (s.store as Record<K, unknown>)[method] = async (...args: unknown[]) => {
      entered();
      await gate;
      return real(...args);
    };
    return { reached, release };
  }

  it('keeps a tick made while a turn’s end is being written, on screen and in the next turn', async () => {
    const s = await setup();
    await s.runtime.open();
    expect(await s.runtime.send('Rename the course.')).toBe(true);
    await s.call('set_course_details', { title: 'Mid-turn' });
    const held = hold(s, 'saveTurn');
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await held.reached;
    const ticked = s.runtime.updateReview({ viewed: ['course:course'] });
    held.release();
    expect(await ticked).toBe(true);
    await s.runtime.settled();
    expect(s.state().session?.viewed).toEqual(['course:course']);
    expect(s.disk().viewed).toEqual(['course:course']);
    await renameTurn(s, 'Second');
    expect(s.state().session?.viewed).toEqual(['course:course']);
    expect(s.disk()).toMatchObject({ viewed: ['course:course'], turns: [{}, {}] });
  });

  it('keeps a summary typed while an undo is being written', async () => {
    const s = await setup();
    await s.runtime.open();
    await renameTurn(s, 'One');
    const held = hold(s, 'undoTurn');
    const undoing = s.runtime.undo();
    await held.reached;
    const typed = s.runtime.updateReview({ summary: 'Typed meanwhile.' });
    held.release();
    expect(await undoing).toBe(true);
    expect(await typed).toBe(true);
    expect(s.state().session).toMatchObject({ summary: 'Typed meanwhile.', turns: [] });
    expect(s.disk()).toMatchObject({ summary: 'Typed meanwhile.', turns: [] });
  });

  it('keeps a goal ticked while the Educator’s own turn is being written', async () => {
    const s = await setup();
    await s.runtime.open();
    const work = s.state().work as NonNullable<ReturnType<Setup['state']>['work']>;
    const held = hold(s, 'saveTurn');
    const editing = s.runtime.educatorTurn(
      { ...work, course: { ...work.course, title: 'By hand' } },
      'Renamed the course',
    );
    await held.reached;
    const goals = [{ text: 'Simplify chapter one.', done: true }];
    const ticked = s.runtime.updateReview({ goals });
    held.release();
    expect(await editing).toBe(true);
    expect(await ticked).toBe(true);
    expect(s.state().session?.goals).toEqual(goals);
    expect(s.disk().goals).toEqual(goals);
  });

  /** A tool that waits for `release` before it sets the goals. */
  function slowGoals() {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const reached = new Promise<void>((resolve) => (entered = resolve));
    const tool: Tool = {
      name: 'slow_goals',
      description: 'Sets the goals, slowly.',
      input: z.strictObject({
        goals: z.array(z.strictObject({ text: z.string(), done: z.boolean() })),
      }),
      run: async (state, input: { goals: { text: string; done: boolean }[] }) => {
        entered();
        await gate;
        return { state: { ...state, goals: input.goals }, text: 'Set.' };
      },
    };
    return { tool, reached, release };
  }

  it('keeps a tick made while a tool runs', async () => {
    const slow = slowGoals();
    const s = await setup({ options: { tools: [slow.tool] } });
    await s.runtime.open();
    expect(await s.runtime.send('Mark the goal.')).toBe(true);
    const goals = [{ text: 'Simplify chapter one.', done: false }];
    const call = s.call('slow_goals', { goals });
    await slow.reached;
    const ticked = s.runtime.updateReview({ viewed: ['course:course'] });
    slow.release();
    expect(await call).toEqual({ text: 'Set.' });
    expect(await ticked).toBe(true);
    expect(s.state().session).toMatchObject({ viewed: ['course:course'], goals });
  });

  it('lets a tool that saw an Educator’s goals set them otherwise, on screen and in the file', async () => {
    const first = slowGoals();
    const second = slowGoals();
    const s = await setup({
      options: { tools: [first.tool, { ...second.tool, name: 'slow_too' }] },
    });
    await s.runtime.open();
    expect(await s.runtime.send('Mark the goal.')).toBe(true);
    const educator = [{ text: 'Simplify chapter one.', done: true }];
    const agent = [{ text: 'Simplify chapter one.', done: false }];
    // The first call holds the queue; the second waits behind it, then the Educator ticks.
    const one = s.call('slow_goals', { goals: educator });
    await first.reached;
    const two = s.call('slow_too', { goals: agent });
    const ticked = s.runtime.updateReview({ goals: educator, viewed: ['course:course'] });
    first.release();
    await one;
    await second.reached;
    expect(s.state().session?.goals).toEqual(educator);
    second.release();
    await two;
    expect(await ticked).toBe(true);
    // The second call saw the tick and changed the goals after it: the agent's are the latest.
    expect(s.state().session).toMatchObject({ goals: agent, viewed: ['course:course'] });
    expect(s.disk()).toMatchObject({ viewed: ['course:course'], goals: [{ done: false }] });
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await s.runtime.settled();
    expect(s.disk()).toMatchObject({ goals: agent, viewed: ['course:course'] });
  });

  it('drops from a seen Review edit only the fields a tool then set otherwise', () => {
    const goals = [{ text: 'A goal.', done: true }];
    expect(
      yieldTo({ summary: 'Mine.', goals, viewed: ['x'] }, { summary: 'Mine.', goals: [] }),
    ).toEqual({ summary: 'Mine.', viewed: ['x'] });
    expect(yieldTo({ viewed: ['x'] }, { summary: 'Other.', goals })).toEqual({ viewed: ['x'] });
  });

  it('says so when the file could not be written, keeping what was typed in memory', async () => {
    const s = await setup();
    await s.runtime.open();
    s.store.save = vi.fn().mockRejectedValue(REFUSED);
    expect(await s.runtime.updateReview({ summary: 'Kept here.' })).toBe(false);
    expect(s.state()).toMatchObject({
      problem: { code: 'app' },
      session: { summary: 'Kept here.' },
    });
    expect(log.warn).toHaveBeenCalledWith('Session review not saved', {
      sessionId: 's1',
      reason: 'refused',
    });
  });

  it('changes nothing in a closed session', async () => {
    const s = await setup({ edit: (x) => ({ ...x, status: 'saved' }) });
    await s.runtime.open();
    expect(await s.runtime.updateReview({ summary: 'No.' })).toBe(false);
    expect(s.disk().summary).toBe('');
  });
});

describe('a turn by the Educator', () => {
  const renamed = (s: Setup, title: string) => {
    const work = s.state().work as NonNullable<ReturnType<Setup['state']>['work']>;
    return { ...work, course: { ...work.course, title } };
  };

  it('writes the copy as a turn of its own, by the Educator, and tells the agent next time', async () => {
    const s = await setup();
    await s.runtime.open();
    const editing = s.runtime.educatorTurn(renamed(s, 'By hand'), 'Put back Course details');
    expect(s.state().status).toBe('editing');
    expect(s.runtime.busy()).toBe(true);
    expect(s.state().canUndo).toBe(false);
    expect(await editing).toBe(true);
    expect(s.state()).toMatchObject({ status: 'ready', changes: { count: 1 } });
    expect(s.disk().turns).toEqual([
      {
        id: 't1',
        at: T0.toISOString(),
        by: 'educator',
        summary: 'Put back Course details',
        checkpoint: 't1.json',
        changes: 1,
        parts: [{ kind: 'course', title: '', status: 'changed' }],
      },
    ]);
    expect(s.disk().work.course.title).toBe('By hand');
    // The first turn also keeps the copy from before it, for Undo.
    expect(s.files.has(`u1/s1/checkpoints/${START_CHECKPOINT}`)).toBe(true);
    expect(s.chat()).toEqual([
      {
        kind: 'notice',
        turnId: 't1',
        at: T0.toISOString(),
        text: 'You changed the course: Put back Course details',
      },
    ]);
    expect(log.info).toHaveBeenCalledWith('Session educator turn saved', {
      sessionId: 's1',
      turnId: 't1',
      changes: 1,
    });
    // Undo takes it back like any other turn.
    expect(s.state().canUndo).toBe(true);

    expect(await s.runtime.send('Carry on.')).toBe(true);
    expect(s.agent.send).toHaveBeenLastCalledWith('s1', `${HAND_EDIT_NOTE}Carry on.`);
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

  it('keeps the note for the agent when the message was not sent', async () => {
    const s = await setup();
    await s.runtime.open();
    await s.runtime.educatorTurn(renamed(s, 'By hand'), 'Hand edit');
    s.agent.send.mockRejectedValueOnce(REFUSED);
    expect(await s.runtime.send('First.')).toBe(false);
    expect(await s.runtime.send('Second.')).toBe(true);
    expect(s.agent.send).toHaveBeenLastCalledWith('s1', `${HAND_EDIT_NOTE}Second.`);
  });

  it('counts a turn that could not be written with it, from the last written copy', async () => {
    const s = await setup();
    await s.runtime.open();
    const saveTurn = s.store.saveTurn;
    s.store.saveTurn = vi.fn().mockRejectedValueOnce(REFUSED).mockImplementation(saveTurn);
    await renameTurn(s, 'One');
    expect(s.state().unsaved).not.toBeNull();
    const work = s.state().work as NonNullable<ReturnType<Setup['state']>['work']>;
    const next = { ...work, course: { ...work.course, summary: 'Changed by hand.' } };
    expect(await s.runtime.educatorTurn(next, 'Hand edit')).toBe(true);
    expect(s.state().unsaved).toBeNull();
    expect(s.disk().turns.map((t) => [t.id, t.by, t.changes])).toEqual([['t2', 'educator', 1]]);
    expect(s.disk().work.course).toMatchObject({ title: 'One', summary: 'Changed by hand.' });
  });

  it('leaves the copy as it was when the turn could not be written', async () => {
    const s = await setup();
    await s.runtime.open();
    s.store.saveTurn = vi.fn().mockRejectedValue(REFUSED);
    expect(await s.runtime.educatorTurn(renamed(s, 'Lost'), 'Hand edit')).toBe(false);
    expect(s.state()).toMatchObject({ status: 'ready', problem: { code: 'app' }, turns: [] });
    expect(s.state().work?.course.title).toBe('Git, the NonStop Way');
    expect(log.error).toHaveBeenCalledWith('Session educator turn not saved', REFUSED, {
      sessionId: 's1',
      turnId: 't1',
    });
    // Nothing to tell the agent.
    await s.runtime.send('Go.');
    expect(s.agent.send).toHaveBeenLastCalledWith('s1', 'Go.');
  });

  it('only between turns, in an open session', async () => {
    const s = await setup();
    await s.runtime.open();
    await s.runtime.send('Working.');
    expect(await s.runtime.educatorTurn(renamed(s, 'No'), 'x')).toBe(false);
    const closed = await setup({ edit: (x) => ({ ...x, status: 'saved' }) });
    await closed.runtime.open();
    expect(await closed.runtime.educatorTurn(renamed(closed, 'No'), 'x')).toBe(false);
  });

  it('carries on with a turn the agent was already in when the write finishes', async () => {
    const s = await setup();
    await s.runtime.open();
    const editing = s.runtime.educatorTurn(renamed(s, 'By hand'), 'Hand edit');
    s.emit({ type: 'text', sessionId: 's1', text: 'Still here.' });
    expect(await editing).toBe(true);
    expect(s.state()).toMatchObject({ status: 'working', canStop: true });
  });

  it('writes no start copy after the first turn', async () => {
    const s = await setup();
    await s.runtime.open();
    await renameTurn(s, 'One');
    s.store.saveStart = vi.fn();
    expect(await s.runtime.educatorTurn(renamed(s, 'Two'), 'Hand edit')).toBe(true);
    expect(s.store.saveStart).not.toHaveBeenCalled();
    expect(s.disk().turns.map((t) => t.by)).toEqual(['agent', 'educator']);
  });
});
