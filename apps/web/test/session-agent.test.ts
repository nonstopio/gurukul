import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { MAX_MESSAGE_LENGTH, MAX_TOOL_RESULT_LENGTH } from '@gurukul/desktop/bridge';
import { SESSION_CHECKPOINTS_KEPT } from '@gurukul/schema';
import type { AuthoringSession } from '@gurukul/schema';
import { TOOL_ACTIVITY, toolActivity } from '../src/studio/session/activity';
import {
  MESSAGE_MAX_LENGTH,
  TOOL_RESULT_MAX_LENGTH,
  appProblem,
  createAgentSession,
  problemOf,
  statusProblem,
  turnSummary,
  undoNote,
} from '../src/studio/session/agent';
import type { AgentSessionOptions } from '../src/studio/session/agent';
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
  const started = await store.start(
    init.kind === 'new'
      ? { kind: 'new', goal: 'A course on Git.' }
      : { kind: 'edit', courseId: 'git', goal: 'Simplify chapter one.' },
    async () => draftDoc(makeCourse(), { rev: 4 }),
  );
  if (started.status !== 'started') throw new Error('not started');
  if (init.edit) await store.save(init.edit(started.session));
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

  it('records the Claude session id of a turn end that had no turn', async () => {
    const s = await setup();
    await s.runtime.open();
    s.emit({ type: 'turn_end', sessionId: 's1', agentSessionId: 'claude-2', outcome: 'stopped' });
    await s.runtime.settled();
    expect(s.state()).toMatchObject({ status: 'ready', turns: [] });
    expect(s.state().session?.agentSessionId).toBe('claude-2');
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
