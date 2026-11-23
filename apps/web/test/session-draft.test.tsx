import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthoringSession } from '@gurukul/schema';
import { createSessionStore } from '../src/studio/session/store';
import { acquireAgentSession } from '../src/studio/session/useAgentSession';
import type { AgentSessionHandle } from '../src/studio/session/useAgentSession';
import { HAND_EDIT_WRITE_MS, useSessionDraft } from '../src/studio/session/useSessionDraft';
import type { Working } from '../src/studio/types';
import { makeCourse } from './fake-data';
import { fakeAgent, fakeDesktop } from './fake-desktop';
import { draftDoc } from './fake-studio';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

let n = 0;

/** A session on disk, its shared runtime held by the test, and a handle whose actions are spies. */
async function setup(edits: { accepted?: boolean } = {}) {
  n += 1;
  const sessionId = `d${n}`;
  const fake = fakeDesktop();
  fakeAgent(fake.desktop);
  const store = createSessionStore({ desktop: fake.desktop, uid: 'u1', newId: () => sessionId });
  const started = await store.start({ kind: 'edit', courseId: 'git' }, async () =>
    draftDoc(makeCourse(), { rev: 4 }),
  );
  const session = (started as { session: AuthoringSession }).session;
  const key = { desktop: fake.desktop, uid: 'u1', sessionId };
  const held = acquireAgentSession(key);
  await held.opened;
  const endEdits = vi.spyOn(held.session, 'endEdits');
  const keepEdits = vi.spyOn(held.session, 'keepEdits');
  const agent = {
    ...held.session.getState(),
    edit: vi.fn(() => edits.accepted ?? true),
    keepEdits: vi.fn(async () => true),
    dropIncomplete: vi.fn(async () => undefined),
  } as unknown as AgentSessionHandle;
  const work = session.work as Working;
  const hook = renderHook(() => useSessionDraft(agent, session, work, key));
  return { agent, hook, held, endEdits, keepEdits, session, key };
}

describe('useSessionDraft', () => {
  it('is Studio’s DraftApi over the session, with no conflict and no backup', async () => {
    const { hook, session, held } = await setup();
    const draft = hook.result.current;
    expect(draft.status).toBe('ready');
    expect(draft.rev).toBe(4);
    expect(draft.save).toBe('saved');
    expect(draft.savedAt).toEqual(new Date(session.updatedAt));
    expect(draft.backupAt).toBeNull();
    expect(draft.restoreBackup()).toBeUndefined();
    expect(draft.discardBackup()).toBeUndefined();
    hook.unmount();
    held.release();
  });

  it('writes an edit a pause later, or at once on Save now', async () => {
    vi.useFakeTimers();
    const { hook, agent, held } = await setup();
    act(() => hook.result.current.update((w) => w));
    expect(agent.edit).toHaveBeenCalledTimes(1);
    act(() => hook.result.current.update((w) => w));
    vi.advanceTimersByTime(HAND_EDIT_WRITE_MS - 1);
    expect(agent.keepEdits).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(agent.keepEdits).toHaveBeenCalledTimes(1);

    act(() => hook.result.current.update((w) => w));
    expect(await hook.result.current.saveNow()).toBe(true);
    vi.advanceTimersByTime(HAND_EDIT_WRITE_MS);
    expect(agent.keepEdits).toHaveBeenCalledTimes(2);
    hook.unmount();
    held.release();
  });

  it('drops edits it cannot keep on reload, with no write left waiting', async () => {
    vi.useFakeTimers();
    const { hook, agent, held } = await setup();
    act(() => hook.result.current.update((w) => w));
    hook.result.current.reload();
    expect(agent.dropIncomplete).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(HAND_EDIT_WRITE_MS);
    expect(agent.keepEdits).not.toHaveBeenCalled();
    hook.unmount();
    held.release();
  });

  it('schedules nothing for an edit the runtime refused', async () => {
    vi.useFakeTimers();
    const { hook, agent, held } = await setup({ accepted: false });
    act(() => hook.result.current.update((w) => w));
    vi.advanceTimersByTime(HAND_EDIT_WRITE_MS);
    expect(agent.keepEdits).not.toHaveBeenCalled();
    hook.unmount();
    held.release();
  });

  it('writes when the window goes, and ends the edits as a turn when the editor is left', async () => {
    const { hook, held, endEdits, keepEdits } = await setup();
    vi.useFakeTimers();
    window.dispatchEvent(new Event('pagehide'));
    expect(keepEdits).toHaveBeenCalledTimes(1);
    hook.unmount();
    window.dispatchEvent(new Event('pagehide'));
    expect(keepEdits).toHaveBeenCalledTimes(1);
    // On the next task, so an editor mounted again at once keeps the same edits open.
    expect(endEdits).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(endEdits).toHaveBeenCalledTimes(1);
    held.release();
  });

  it('keeps the edits open when an editor on the session mounts again at once', async () => {
    const { hook, held, endEdits, agent, session, key } = await setup();
    vi.useFakeTimers();
    hook.unmount();
    const again = renderHook(() => useSessionDraft(agent, session, session.work as Working, key));
    vi.runAllTimers();
    expect(endEdits).not.toHaveBeenCalled();
    again.unmount();
    vi.runAllTimers();
    expect(endEdits).toHaveBeenCalledTimes(1);
    held.release();
  });
});
