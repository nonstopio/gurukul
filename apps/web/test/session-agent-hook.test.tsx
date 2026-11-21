import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentSession } from '../src/studio/session/agent';
import type { AgentSession, AgentSessionOptions } from '../src/studio/session/agent';
import { createSessionStore } from '../src/studio/session/store';
import {
  acquireAgentSession,
  agentSessionSource,
  useAgentSession,
} from '../src/studio/session/useAgentSession';
import { makeCourse } from './fake-data';
import { AGENT_SESSION_ID, fakeAgent, fakeDesktop } from './fake-desktop';
import { draftDoc } from './fake-studio';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

async function setup() {
  const fake = fakeDesktop();
  const agent = fakeAgent(fake.desktop);
  const store = createSessionStore({ desktop: fake.desktop, uid: 'u1', newId: () => 's1' });
  await store.start({ kind: 'edit', courseId: 'git' }, async () =>
    draftDoc(makeCourse(), { rev: 4 }),
  );
  return { ...fake, ...agent };
}

/** Counts the runtimes made, so a test can tell one shared runtime from two. */
function counting() {
  const made: AgentSession[] = [];
  const create = (options: AgentSessionOptions) => {
    const session = createAgentSession(options);
    made.push(session);
    return session;
  };
  return { made, create };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('acquireAgentSession', () => {
  it('shares one runtime per session and ends it with the last release', async () => {
    const s = await setup();
    const { made, create } = counting();
    const options = { desktop: s.desktop, uid: 'u1', sessionId: 's1' };
    const first = acquireAgentSession(options, create);
    const second = acquireAgentSession(options, create);
    expect(made).toHaveLength(1);
    expect(second.session).toBe(first.session);
    await first.opened;
    expect(first.session.getState().status).toBe('ready');
    first.release();
    expect(s.listening()).toBe(2);
    second.release();
    expect(s.listening()).toBe(0);
    acquireAgentSession(options, create).release();
    expect(made).toHaveLength(2);
  });

  it('keeps a runtime with a running turn until the turn is written', async () => {
    const s = await setup();
    const { made, create } = counting();
    const options = { desktop: s.desktop, uid: 'u1', sessionId: 's1' };
    const held = acquireAgentSession(options, create);
    await held.opened;
    await held.session.send('Rename the course.');
    held.release();
    expect(s.listening()).toBe(2);
    await s.call('set_course_details', { title: 'Renamed' });
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await held.session.settled();
    expect(s.listening()).toBe(0);
    const saved = JSON.parse(s.files.get('u1/s1/session.json') as string);
    expect(saved.work.course.title).toBe('Renamed');
    expect(made).toHaveLength(1);
  });

  it('hands a runtime still finishing its turn to the next page that opens it', async () => {
    const s = await setup();
    const { made, create } = counting();
    const options = { desktop: s.desktop, uid: 'u1', sessionId: 's1' };
    const held = acquireAgentSession(options, create);
    await held.opened;
    await held.session.send('Rename the course.');
    held.release();
    const again = acquireAgentSession(options, create);
    expect(again.session).toBe(held.session);
    s.emit({
      type: 'turn_end',
      sessionId: 's1',
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await again.session.settled();
    expect(s.listening()).toBe(2);
    again.release();
    expect(s.listening()).toBe(0);
    expect(made).toHaveLength(1);
  });
});

describe('agentSessionSource', () => {
  it('is loading and does nothing until something subscribes', async () => {
    const s = await setup();
    const source = agentSessionSource({ desktop: s.desktop, uid: 'u1', sessionId: 's1' });
    expect(source.getState().status).toBe('loading');
    expect(await source.send('Hello')).toBe(false);
    expect(await source.undo()).toBe(false);
    await source.stop();
    await source.retry();
    expect(source.attach({ kind: 'course', ids: {}, label: 'Course details' })).toBe(false);
    source.detach('course');
    expect(await source.updateReview({ summary: 'x' })).toBe(false);
    expect(await source.educatorTurn({ course: makeCourse(), answers: {} }, 'x')).toBe(false);
    expect(source.edit((w) => w)).toBe(false);
    expect(await source.keepEdits()).toBe(false);
    await source.endEdits();
    await source.dropIncomplete();
    expect(await source.saveToDraft(async () => 1)).toEqual({ ok: false, reason: 'busy' });
    const base = { rev: 1, savedAt: null, work: { course: makeCourse(), answers: {} } };
    expect(await source.bringIn(base, base.work, 'x')).toBe(false);
    expect(await source.courseCreated(base)).toBe(false);
    await source.noteCreating('git', 'Git');
    expect(await source.ownCourse(draftDoc(makeCourse()))).toBeNull();
    expect(s.agent.status).not.toHaveBeenCalled();
    expect(s.listening()).toBe(0);
  });
});

describe('useAgentSession', () => {
  it('draws the session and acts on it', async () => {
    const s = await setup();
    const { result, unmount } = renderHook(() =>
      useAgentSession({ desktop: s.desktop, uid: 'u1', sessionId: 's1' }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.work?.course.title).toBe('Git, the NonStop Way');
    act(() => {
      expect(result.current.attach({ kind: 'landing', ids: {}, label: 'Landing page' })).toBe(true);
    });
    expect(result.current.attachments).toHaveLength(1);
    act(() => result.current.detach('landing'));
    expect(result.current.attachments).toHaveLength(0);
    await act(async () => {
      expect(await result.current.send('Rename the course.')).toBe(true);
    });
    expect(result.current.status).toBe('working');
    await act(async () => {
      await result.current.stop();
    });
    expect(s.agent.stop).toHaveBeenCalledWith('s1');
    expect(result.current.status).toBe('stopping');
    await act(async () => {
      s.emit({
        type: 'turn_end',
        sessionId: 's1',
        agentSessionId: AGENT_SESSION_ID,
        outcome: 'stopped',
      });
    });
    await waitFor(() => expect(result.current.turns).toHaveLength(1));
    await act(async () => {
      expect(await result.current.undo()).toBe(true);
      await result.current.retry();
    });
    expect(result.current.turns).toHaveLength(0);
    await act(async () => {
      expect(await result.current.updateReview({ viewed: ['course:course'] })).toBe(true);
      const work = result.current.work as NonNullable<typeof result.current.work>;
      expect(
        await result.current.educatorTurn(
          { ...work, course: { ...work.course, title: 'Hand' } },
          'Hand',
        ),
      ).toBe(true);
    });
    expect(result.current.session?.viewed).toEqual(['course:course']);
    expect(result.current.turns).toHaveLength(1);
    unmount();
    expect(s.listening()).toBe(0);
  });
});
