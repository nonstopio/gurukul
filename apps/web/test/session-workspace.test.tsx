import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COURSE_BYTES_LIMIT } from '@gurukul/schema';
import type { AnswerKeys, Turn } from '@gurukul/schema';
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
const { log } = await import('../src/log');

const GIT = makeCourse({ id: 'git', title: 'Git', educatorIds: ['u1'] });
const studio = () => fakeStudio({ courses: [{ live: GIT, draft: draftDoc(GIT, { rev: 3 }) }] });

afterEach(() => {
  uninstallDesktop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
    /** Keeps the session as the store starts it: no goal, the course's own title. */
    fresh?: boolean;
    /** Changes the fake agent before the page asks it anything. */
    prepare?: (agent: ReturnType<typeof fakeAgent>['agent']) => void;
    /** The chat already on this computer. */
    transcript?: TranscriptEntry[];
    /** Turns already written, each with the session's copy of the course as its checkpoint. */
    turns?: Turn[];
    /** The draft the session starts from; Git by default. */
    course?: typeof GIT;
    /** The draft's answer keys; none by default. */
    answers?: AnswerKeys;
    path?: (id: string) => string;
    info?: () => Promise<typeof DESKTOP_INFO>;
    labels?: 'generic' | 'gurukul';
  } = {},
) {
  // A new id each time: a runtime still writing a turn outlives its test (`acquireAgentSession`).
  sessions += 1;
  const id = `s${sessions}`;
  const fake = fakeDesktop(init.info ? { info: init.info } : {});
  const store = createSessionStore({ desktop: fake.desktop, uid: 'u1', newId: () => id });
  const started = await store.start(
    init.kind === 'new' ? { kind: 'new' } : { kind: 'edit', courseId: 'git' },
    async () =>
      draftDoc(init.course ?? GIT, { rev: 3, ...(init.answers && { answers: init.answers }) }),
  );
  // A session an earlier version started has a goal and its title; the box still opens with it.
  if (started.status === 'started' && !init.fresh) {
    const goal = init.kind === 'new' ? 'A course on code review.' : 'Simplify the basics.';
    await store.save({ ...started.session, title: goal, goals: [{ text: goal, done: false }] });
  }
  if (init.transcript) await store.writeTranscript(id, init.transcript);
  if (init.turns && started.status === 'started') {
    let current = (await store.read(id)) as NonNullable<Awaited<ReturnType<typeof store.read>>>;
    for (const turn of init.turns) current = await store.saveTurn(current, turn, current.work);
  }
  const agent = fakeAgent(fake.desktop, {
    ...(init.status ? { status: init.status } : {}),
    ...(init.start ? { start: init.start } : {}),
  });
  init.prepare?.(agent.agent);
  installDesktop(fake.desktop);
  const app = await openApp(init.path?.(id) ?? `/studio/sessions/${id}`, {
    roles: ['educator'],
    studio: studio(),
    ...(init.labels ? { labels: init.labels } : {}),
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

/**
 * Answer keys that put the draft past `COURSE_BYTES_LIMIT`, which counts the course and its keys
 * together. The bulk is in the keys because the page never draws them: as Markdown, the preview
 * parsed over a megabyte and these tests ran past their timeout on a slow runner.
 */
const OVER_THE_LIMIT: AnswerKeys = { q1: { q1a: ['x'.repeat(COURSE_BYTES_LIMIT)] } };

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
  await screen.findByRole('link', { name: /in turn \d+, open in Review$/ });
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

  it('opens a session started with no goal on the course’s title and an empty box, with the disclosure', async () => {
    await open({ fresh: true });
    expect(await screen.findByRole('heading', { level: 1, name: 'Git' })).toBeTruthy();
    expect(screen.getByText(/Say what you want to do in the box below/)).toBeTruthy();
    expect(box().value).toBe('');
    expect(screen.queryByText(/runs Claude Code on this computer/i)).toBeNull();
    expect(await axeViolations(document.body)).toEqual([]);
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
    const line = screen.getByRole('link', { name: '1 change in turn 1, open in Review' });
    expect(line.getAttribute('href')).toMatch(
      new RegExp(`^/studio/sessions/${s.id}/review\\?turn=`),
    );
    expect(screen.getByRole('button', { name: 'Go back to before this' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    // How it got there: folded, and the steps in plain words once opened.
    const how = screen.getByRole('button', { name: 'How it got there' });
    expect(how.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(how);
    expect(how.getAttribute('aria-expanded')).toBe('true');
    expect(within(screen.getByRole('log')).getByText('Writing a lesson')).toBeTruthy();
    // What it changed, with when, then the footer and the check.
    const changed = within(screen.getByRole('list', { name: 'What this turn changed' }));
    expect(changed.getByText('Edited Lesson l1')).toBeTruthy();
    expect(changed.getByText('just now')).toBeTruthy();
    expect(screen.getByText(/Worked for \d+s,/)).toBeTruthy();
    expect(screen.getByText('Checked: no new problems')).toBeTruthy();
    // Copy puts the reply on the clipboard and says so.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fireEvent.click(screen.getByRole('button', { name: 'Copy reply' }));
    expect(await screen.findByText('Reply copied')).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith('I added **one** block.');
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

  it('keeps the chat below a top bar that a long title wraps, by its measured height', async () => {
    // jsdom lays nothing out: the bar reports the height a three-line title gives it at 1024px.
    const observed: { target: Element; disconnected: boolean }[] = [];
    const notify: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: () => void) {}
        observe(target: Element) {
          observed.push({ target, disconnected: false });
          notify.push(this.callback);
          this.callback();
        }
        disconnect() {
          for (const o of observed) o.disconnected = true;
        }
      },
    );
    let height = 117.6;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return { height: this.classList.contains('g-topbar') ? height : 0 } as DOMRect;
    });
    const s = await open();
    await screen.findByRole('log', { name: 'Chat with the agent' });
    const workspace = () => document.querySelector('.ss-workspace') as HTMLElement;
    const bar = screen.getByRole('heading', { level: 1 }).closest('header');
    // The bar is measured; the chat log is watched too, to keep its newest message in view.
    expect(observed.map((o) => o.target)).toEqual([
      screen.getByRole('log', { name: 'Chat with the agent' }),
      bar,
    ]);
    await waitFor(() => expect(workspace().style.getPropertyValue('--ss-bar')).toBe('118px'));
    // The title changes (the agent sets one) and the bar with it.
    height = 68;
    act(() => {
      for (const callback of notify) callback();
    });
    expect(workspace().style.getPropertyValue('--ss-bar')).toBe('68px');
    s.app.unmount();
    expect(observed.every((o) => o.disconnected)).toBe(true);
  });

  it('keeps the newest message in view when a taller bar makes the chat log shorter', async () => {
    // jsdom lays nothing out: the test moves the log's box as a browser would, and reports it.
    const watching = new Map<Element, () => void>();
    const disconnected: Element[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private target: Element | null = null;
        constructor(private readonly callback: () => void) {}
        observe(target: Element) {
          this.target = target;
          watching.set(target, this.callback);
        }
        disconnect() {
          disconnected.push(this.target as Element);
        }
      },
    );
    const s = await open();
    const chat = await screen.findByRole('log', { name: 'Chat with the agent' });
    let clientHeight = 313;
    let scrollTop = 0;
    const scrollHeight = 1000;
    Object.defineProperties(chat, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, get: () => clientHeight },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        // A browser keeps scrollTop within what the box can scroll.
        set: (v: number) => (scrollTop = Math.max(0, Math.min(v, scrollHeight - clientHeight))),
      },
    });
    const resized = (height: number) => {
      clientHeight = height;
      scrollTop = Math.min(scrollTop, scrollHeight - clientHeight);
      act(() => (watching.get(chat) as () => void)());
    };
    // Opened at its newest message.
    chat.scrollTop = scrollHeight;
    fireEvent.scroll(chat);
    expect(scrollTop).toBe(687);
    // A three-line title makes the bar 50px taller, and the log 50px shorter: it stays at the end.
    resized(263);
    expect(scrollTop).toBe(737);
    // Read further up, the Educator stays where they are when the log changes height.
    chat.scrollTop = 200;
    fireEvent.scroll(chat);
    resized(313);
    expect(scrollTop).toBe(200);
    resized(263);
    expect(scrollTop).toBe(200);
    // Back at the end, it follows again.
    chat.scrollTop = scrollHeight;
    fireEvent.scroll(chat);
    resized(313);
    expect(scrollTop).toBe(687);
    s.app.unmount();
    expect(disconnected).toContain(chat);
  });

  it('draws the agent’s links as words with their address, so no click follows one', async () => {
    const s = await open();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy());
    await send(s);
    act(() =>
      s.emit({
        type: 'text',
        text: [
          'Read [the Git book](https://collector.example/?d=Rebase%20first) first.',
          'Also <https://git-scm.com/docs>, [the review](/studio/sessions/s1/review) and',
          '[nothing]() or [a script](javascript:alert(1)).',
          '',
          'See [the **rebase** page](https://git-scm.com/docs/git-rebase).',
        ].join('\n'),
      }),
    );
    const chat = screen.getByRole('log', { name: 'Chat with the agent' });
    await within(chat).findByText(/the Git book/);
    // No link at all: a click opens nothing, in the app or in the system browser.
    expect(chat.querySelector('a')).toBeNull();
    expect(within(chat).queryByRole('link')).toBeNull();
    // The address the words would have hidden is there to read.
    expect(chat.textContent).toContain(
      'the Git book (https://collector.example/?d=Rebase%20first)',
    );
    // An address written as itself shows once.
    expect(chat.textContent).toContain('Also https://git-scm.com/docs,');
    expect(chat.textContent).toContain('the review (/studio/sessions/s1/review)');
    // A link with no address, or one the renderer refuses, is its words alone.
    expect(chat.textContent).toContain('nothing or a script.');
    // Words with emphasis in them keep it, and the address follows.
    expect(chat.textContent).toContain(
      'See the rebase page (https://git-scm.com/docs/git-rebase).',
    );
    expect(within(chat).getByText('rebase').tagName).toBe('STRONG');
  });

  it('undoes the newest turn only after a confirmation', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    await send(s);
    await act(() =>
      s.call('add_block', { lessonId: 'l1', block: { type: 'markdown', md: 'Extra.' } }),
    );
    await endTurn(s);
    fireEvent.click(screen.getByRole('button', { name: 'Go back to before this' }));
    const dialog = screen.getByRole('dialog', { name: 'Go back to before turn 1?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('1 change · checks pass')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Go back to before this' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Go back to before turn 1' }),
    );
    expect(
      await screen.findByText('Turn undone: the course is back as it was before it.'),
    ).toBeTruthy();
    expect(screen.getByText('0 changes · checks pass')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /in turn 1,/ })).toBeNull();
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
    expect(screen.getByRole('link', { name: 'no changes in turn 1, open in Review' })).toBeTruthy();
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
    await open({ answers: OVER_THE_LIMIT });
    expect(await screen.findByText('0 changes · 1 check fails')).toBeTruthy();
  });
});

describe('attaching parts of the course to a message', () => {
  const attachButton = (name: string) =>
    screen.getByRole('button', { name: `Attach ${name} to your message` });
  const chips = () => screen.queryByRole('list', { name: 'Attached to your next message' });

  it('attaches a block from the preview, sends its ids, and shows it with the message', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    const block = attachButton('Lesson 1.1 · Text block 1');
    expect(block.getAttribute('aria-pressed')).toBe('false');
    // A real button, so the keyboard reaches it.
    block.focus();
    expect(document.activeElement).toBe(block);
    fireEvent.click(block);
    expect(block.getAttribute('aria-pressed')).toBe('true');
    expect(within(chips() as HTMLElement).getByText('Lesson 1.1 · Text block 1')).toBeTruthy();
    expect(
      screen.getByText('Enter sends, with what is attached; Shift and Enter start a new line.'),
    ).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);

    await send(s, 'Make this shorter.');
    expect(s.agent.send).toHaveBeenCalledWith(
      s.id,
      expect.stringMatching(
        /^\[From Gurukul: the Educator attached this part[^\n]*\n- Lesson 1\.1 · Text block 1: \{"kind":"block","itemId":"l1","blockId":"l1-b"\}\n\nMake this shorter\.$/,
      ),
    );
    expect(chips()).toBeNull();
    expect(block.getAttribute('aria-pressed')).toBe('false');
    const sent = screen.getByRole('list', { name: 'Attached to this message' });
    expect(sent.textContent).toBe('Lesson 1.1 · Text block 1');
    expect(within(sent).queryByRole('button')).toBeNull();
  });

  it('attaches a question, and removes a part from its chip or its button', async () => {
    await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    choose(screen.getByRole('combobox', { name: 'Lesson or Quiz' }), '2.2 · Quiz I');
    fireEvent.click(attachButton('Quiz 2.2 · Question 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(attachButton('Lesson 2.1 · Text block 1'));
    expect(
      within(chips() as HTMLElement)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Quiz 2.2 · Question 1', 'Lesson 2.1 · Text block 1']);
    // Pressed again, the block comes off.
    fireEvent.click(attachButton('Lesson 2.1 · Text block 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Quiz 2.2 · Question 1' }));
    expect(chips()).toBeNull();
    // Nothing left to focus in the list: the message box takes it.
    expect(document.activeElement).toBe(box());
  });

  it('attaches chapters, items, the course details and the landing page from the outline', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    await send(s);
    await act(() => s.call('set_course_details', { title: 'Git, simply' }));
    await act(() => s.call('set_landing', { description: 'Learn Git, simply.' }));
    await act(() => s.call('remove_item', { itemId: 'l2' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Outline' }));
    const outline = screen.getByRole('tabpanel', { name: 'Outline' });
    for (const name of [
      'Chapter 1 · Basics',
      'Lesson 1.1 · Lesson l1',
      'Quiz 2.2 · Quiz I',
      'Course details',
      'Landing page',
    ]) {
      const button = within(outline).getByRole('button', {
        name: `Attach ${name} to your message`,
      });
      fireEvent.click(button);
      expect(button.getAttribute('aria-pressed')).toBe('true');
    }
    // A removed lesson can no longer be attached.
    expect(within(outline).queryByRole('button', { name: /Attach Lesson l2/ })).toBeNull();
    expect(within(chips() as HTMLElement).getAllByRole('listitem')).toHaveLength(5);
    fireEvent.click(within(outline).getByRole('button', { name: /^Attach Landing page/ }));
    expect(within(chips() as HTMLElement).getAllByRole('listitem')).toHaveLength(4);
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('names lessons "Lesson" in the Gurukul names too, as the preview does', async () => {
    await open({ labels: 'gurukul' });
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    expect(screen.getByText('Lesson 1.1')).toBeTruthy();
    fireEvent.click(attachButton('Lesson 1.1 · Text block 1'));
    expect(within(chips() as HTMLElement).getByText('Lesson 1.1 · Text block 1')).toBeTruthy();
    choose(screen.getByRole('combobox', { name: 'Lesson or Pariksha' }), '2.2 · Quiz I');
    fireEvent.click(attachButton('Pariksha 2.2 · Question 1'));
    fireEvent.click(screen.getByRole('tab', { name: 'Outline' }));
    const outline = screen.getByRole('tabpanel', { name: 'Outline' });
    for (const name of ['Parva 1 · Basics', 'Lesson 1.1 · Lesson l1', 'Pariksha 2.2 · Quiz I']) {
      expect(
        within(outline).getByRole('button', { name: `Attach ${name} to your message` }),
      ).toBeTruthy();
    }
    expect(screen.queryByText(/Adhyaya/)).toBeNull();
  });

  it('says when a message already carries as many parts as it can', async () => {
    await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    fireEvent.click(screen.getByRole('tab', { name: 'Outline' }));
    const outline = screen.getByRole('tabpanel', { name: 'Outline' });
    const buttons = within(outline).getAllByRole('button', { name: /^Attach / });
    // The fixture has 2 chapters and 5 items: 7 parts. Fill the rest from the preview.
    for (const button of buttons) fireEvent.click(button);
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    fireEvent.click(attachButton('Lesson 1.1 · Text block 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(attachButton('Lesson 1.2 · Text block 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(attachButton('Lesson 2.1 · Text block 1'));
    expect(within(chips() as HTMLElement).getAllByRole('listitem')).toHaveLength(10);
    choose(screen.getByRole('combobox', { name: 'Lesson or Quiz' }), '2.2 · Quiz I');
    fireEvent.click(attachButton('Quiz 2.2 · Question 1'));
    expect(
      await screen.findByText(
        'A message carries at most 10 parts of the course. Remove one first.',
      ),
    ).toBeTruthy();
    expect(attachButton('Quiz 2.2 · Question 1').getAttribute('aria-pressed')).toBe('false');
  });

  it('counts what is attached on the Chat button below 1024px', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: !query.includes('64rem'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    await open();
    expect(await screen.findByRole('heading', { level: 2, name: 'Lesson l1' })).toBeTruthy();
    fireEvent.click(attachButton('Lesson 1.1 · Text block 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Chat · 1 attached' }));
    const drawer = screen.getByRole('dialog', { name: 'Chat' });
    expect(within(drawer).getByText('Lesson 1.1 · Text block 1')).toBeTruthy();
  });

  it('offers no Attach in a closed session', async () => {
    const s = await open({ prepare: () => undefined });
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    const read = await s.store.read(s.id);
    await s.store.save({ ...(read as NonNullable<typeof read>), status: 'saved' });
    s.app.unmount();
    await openApp(`/studio/sessions/${s.id}`, { roles: ['educator'], studio: studio() });
    expect(await screen.findByText(/This session was saved and closed/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Attach / })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Sources' })).toBeNull();
  });
});

describe('the workspace’s Sources tab', () => {
  const sourcesTab = () => {
    fireEvent.click(screen.getByRole('tab', { name: 'Sources' }));
    return screen.getByRole('tabpanel', { name: 'Sources' });
  };

  it('shows the folder made for the session, with the notice and its files', async () => {
    const s = await open();
    await screen.findByRole('heading', { level: 2, name: 'Lesson l1' });
    const panel = sourcesTab();
    const group = await within(panel).findByRole('group', { name: 'Sources folder' });
    expect(s.desktop.sources.ensure).toHaveBeenCalledWith({
      uid: 'u1',
      sessionId: s.id,
      suggestedName: 'git',
    });
    expect(within(group).getByText(/sent to Anthropic under your own Claude account/)).toBeTruthy();
    expect(within(group).getByText('~/Material')).toBeTruthy();
    // Nobody picks a folder.
    expect(within(group).queryByRole('button', { name: /folder/i })).toBeNull();
    const files = within(group).getByRole('list', { name: 'Files the agent may read' });
    expect(
      within(files)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Rebase notes.md120 B', 'transcript.txt4 KB']);
    fireEvent.click(within(group).getByRole('button', { name: 'Show in Finder' }));
    expect(s.desktop.sources.reveal).toHaveBeenCalledWith({ uid: 'u1', sessionId: s.id });
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('says when the folder cannot be shown', async () => {
    const s = await open();
    await screen.findByRole('heading', { level: 2, name: 'Lesson l1' });
    const group = await within(sourcesTab()).findByRole('group', { name: 'Sources folder' });
    s.desktop.sources.reveal.mockRejectedValueOnce(new Error('sources.reveal failed'));
    fireEvent.click(within(group).getByRole('button', { name: 'Show in Finder' }));
    expect(await screen.findByText('The folder could not be opened.')).toBeTruthy();
    expect(log.error).toHaveBeenCalledWith('Sources folder not shown', expect.any(Error), {
      sessionId: s.id,
    });
  });

  it('reads the folder again each time the tab opens, and pages a long list', async () => {
    const s = await open();
    await screen.findByRole('heading', { level: 2, name: 'Lesson l1' });
    const files = Array.from({ length: 30 }, (_, i) => ({
      name: `note-${String(i).padStart(2, '0')}.md`,
      bytes: 10,
    }));
    s.desktop.sources.ensure.mockResolvedValue({ path: '~/Notes', files });
    let panel = sourcesTab();
    const list = await within(panel).findByRole('list', { name: 'Files the agent may read' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(25);
    expect(within(panel).getByText('Showing 1–25 of 30')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Next' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    fireEvent.click(screen.getByRole('tab', { name: 'Outline' }));
    s.desktop.sources.ensure.mockResolvedValue({ path: '~/Notes', files: [] });
    panel = sourcesTab();
    expect(
      await within(panel).findByText(/Save files in the folder, or drop them on the chat/),
    ).toBeTruthy();
    expect(within(panel).getByText('No files yet')).toBeTruthy();
  });

  it('says when the folder could not be read, and tries again; a new course has no slug to name it', async () => {
    const s = await open({ kind: 'new' });
    await screen.findByRole('heading', { name: 'Nothing to preview yet' });
    const failure = new Error('sources.ensure failed');
    s.desktop.sources.ensure.mockRejectedValueOnce(failure);
    const panel = sourcesTab();
    expect(within(panel).getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(await within(panel).findByText('The Sources folder could not be read')).toBeTruthy();
    expect(log.error).toHaveBeenCalledWith('Sources folder not listed', failure, {
      sessionId: s.id,
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Try again' }));
    expect(await within(panel).findByText('~/Material')).toBeTruthy();
    expect(s.desktop.sources.ensure).toHaveBeenLastCalledWith({ uid: 'u1', sessionId: s.id });
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
    expect(screen.getByRole('link', { name: '1 change in turn 1, open in Review' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go back to before this' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Go back to before turn 1' }),
    );
    expect(await screen.findByText('0 changes · checks pass')).toBeTruthy();
  });

  it('says when the copy before a turn is gone', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    await send(s);
    await endTurn(s);
    s.files.delete(`u1/${s.id}/checkpoints/start.json`);
    fireEvent.click(screen.getByRole('button', { name: 'Go back to before this' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Go back to before turn 1' }),
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
  it('shows Review inside the session, and keeps the same agent', async () => {
    const s = await open({ path: (id) => `/studio/sessions/${id}/review` });
    expect(await screen.findByRole('heading', { name: 'Nothing has changed yet' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Simplify the basics.' })).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);
    await waitFor(() => expect(s.agent.start).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('link', { name: 'Back to the chat' }));
    expect(await screen.findByRole('log', { name: 'Chat with the agent' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Review' }));
    expect(await screen.findByRole('heading', { name: 'Nothing has changed yet' })).toBeTruthy();
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

describe('the chat of a session already written', () => {
  const turn = (id: string, over: Partial<Turn> = {}): Turn => ({
    id,
    at: new Date().toISOString(),
    by: 'agent',
    summary: id,
    checkpoint: `${id}.json`,
    changes: 0,
    ...over,
  });
  const kinds: NonNullable<Turn['parts']> = [
    { kind: 'course', title: '', status: 'changed' },
    { kind: 'landing', title: '', status: 'changed' },
    { kind: 'chapter', title: 'Basics', status: 'renamed' },
    { kind: 'quiz', title: 'Quiz I', status: 'added' },
    { kind: 'lesson', title: '', status: 'removed' },
    { kind: 'lesson', title: 'One', status: 'moved' },
    { kind: 'lesson', title: 'Two', status: 'added' },
    { kind: 'lesson', title: 'Three', status: 'changed' },
  ];

  it('lists what a turn changed, six rows and a pill for the rest, in the Educator’s words', async () => {
    const entries = (id: string, text: string): TranscriptEntry[] => [
      { kind: 'educator', turnId: id, at: '2026-11-19T10:00:00.000Z', text: 'Go' },
      { kind: 'agent', turnId: id, at: '2026-11-19T10:00:05.000Z', text: text },
    ];
    await open({
      labels: 'gurukul',
      turns: [
        turn('t1', { changes: 8, parts: kinds, at: '2026-11-19T10:02:39.000Z' }),
        turn('t2', { changes: 2 }),
      ],
      transcript: [
        ...entries('t1', 'First reply.'),
        {
          kind: 'activity',
          turnId: 't2',
          at: '2026-11-19T10:03:00.000Z',
          text: 'Checking the course',
        },
      ],
    });
    const list = within(await screen.findByRole('list', { name: 'What this turn changed' }));
    expect(list.getAllByRole('listitem')).toHaveLength(7);
    expect(list.getByText('Edited course details')).toBeTruthy();
    expect(list.getByText('Edited landing page')).toBeTruthy();
    expect(list.getByText('Renamed Parva · Basics')).toBeTruthy();
    expect(list.getByText('Added Pariksha · Quiz I')).toBeTruthy();
    expect(list.getByText('Removed Untitled')).toBeTruthy();
    expect(list.queryByText('Edited Three')).toBeNull();
    fireEvent.click(list.getByRole('button', { name: '+2 more' }));
    expect(list.getByText('Edited Three')).toBeTruthy();
    expect(list.getAllByText('Moved One')).toHaveLength(1);
    fireEvent.click(list.getByRole('button', { name: 'Show fewer' }));
    expect(list.queryByText('Edited Three')).toBeNull();
    // The turn before the newest has no check line of its own, and no copy when no reply.
    expect(screen.getAllByText('Checked: no new problems')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Copy reply' })).toHaveLength(1);
    expect(screen.getByText('Worked for 2m 39s,')).toBeTruthy();
    // A turn with no reply carries its steps on its own line.
    expect(screen.getAllByRole('button', { name: 'How it got there' })).toHaveLength(1);
    // Written before the list was kept: the count only.
    expect(screen.getAllByRole('list', { name: 'What this turn changed' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: '2 changes in turn 2, open in Review' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Go back to before this' })).toHaveLength(1);
  });

  it('says the copy could not be copied, and that it found problems', async () => {
    await open({
      answers: OVER_THE_LIMIT,
      turns: [turn('t1')],
      transcript: [
        { kind: 'educator', turnId: 't1', at: '2026-11-19T10:00:00.000Z', text: 'Go' },
        { kind: 'agent', turnId: 't1', at: '2026-11-19T10:00:05.000Z', text: 'Done.' },
      ],
    });
    expect(await screen.findByText('Checked: problems to fix before saving')).toBeTruthy();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
      configurable: true,
    });
    document.execCommand = vi.fn().mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Copy reply' }));
    expect(await screen.findByText('Could not copy the reply')).toBeTruthy();
  });
});

describe('adding files to the session from the chat', () => {
  const file = (name: string, text = 'data') => new File([text], name);
  const pick = async (files: File[]) => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Add files' }));
    expect(click).toHaveBeenCalled();
    fireEvent.change(input, { target: { files } });
  };
  const panel = () => document.querySelector('.ss-chat__panel') as HTMLElement;
  const dragOf = (types: string[], files: File[] = []) => ({
    dataTransfer: { types, files },
  });
  const chips = () => screen.getByRole('list', { name: 'Attached to your next message' });

  it('adds files from the plus menu, shows them as chips and names them to the agent', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    expect(box().getAttribute('placeholder')).toMatch(/Drop files here/);
    await pick([file('Plan.docx', 'abc'), file('Sheet.xlsx')]);
    await waitFor(() => expect(within(chips()).getByText('Plan.docx')).toBeTruthy());
    expect(within(chips()).getByText('Sheet.xlsx')).toBeTruthy();
    const call = s.desktop.sources.add.mock.calls[0] as unknown as [
      unknown,
      { name: string; bytes: Uint8Array }[],
    ];
    expect(call[0]).toEqual({ uid: 'u1', sessionId: s.id, suggestedName: 'git' });
    expect(call[1].map((f) => [f.name, f.bytes.length])).toEqual([
      ['Plan.docx', 3],
      ['Sheet.xlsx', 4],
    ]);
    await send(s, 'Make a quiz from this sheet.');
    expect(s.agent.send).toHaveBeenCalledWith(
      s.id,
      '[From Gurukul: Files added to the Sources folder: Plan.docx, Sheet.xlsx. Read them with read_source.]\n\nMake a quiz from this sheet.',
    );
    expect(screen.getByRole('list', { name: 'Attached to this message' }).textContent).toBe(
      'Plan.docxSheet.xlsx',
    );
  });

  it('adds files dropped anywhere on the chat, with an overlay while they are over it', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    // Text dragged over is not a file: nothing happens.
    fireEvent.dragEnter(panel(), dragOf(['text/plain']));
    fireEvent.dragOver(panel(), dragOf(['text/plain']));
    fireEvent.dragLeave(panel(), dragOf(['text/plain']));
    fireEvent.drop(panel(), dragOf(['text/plain']));
    expect(screen.queryByText('Drop files to add them to this session')).toBeNull();
    fireEvent.dragEnter(panel(), dragOf(['Files']));
    fireEvent.dragEnter(box(), dragOf(['Files']));
    fireEvent.dragOver(panel(), dragOf(['Files']));
    expect(screen.getByText('Drop files to add them to this session')).toBeTruthy();
    // Crossing into a child and out of it keeps the overlay; leaving the chat removes it.
    fireEvent.dragLeave(box(), dragOf(['Files']));
    expect(screen.getByText('Drop files to add them to this session')).toBeTruthy();
    fireEvent.dragLeave(panel(), dragOf(['Files']));
    expect(screen.queryByText('Drop files to add them to this session')).toBeNull();
    fireEvent.dragEnter(panel(), dragOf(['Files']));
    fireEvent.drop(panel(), dragOf(['Files'], [file('Notes.pdf')]));
    expect(screen.queryByText('Drop files to add them to this session')).toBeNull();
    await waitFor(() => expect(within(chips()).getByText('Notes.pdf')).toBeTruthy());
    expect(s.desktop.sources.add).toHaveBeenCalledTimes(1);
  });

  it('adds files pasted into the box, and leaves pasted text alone', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    fireEvent.paste(box(), { clipboardData: { files: [] } });
    expect(s.desktop.sources.add).not.toHaveBeenCalled();
    fireEvent.paste(box(), { clipboardData: { files: [file('shot.png')] } });
    await waitFor(() => expect(within(chips()).getByText('shot.png')).toBeTruthy());
  });

  it('shows the added files in the Sources tab', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    fireEvent.click(screen.getByRole('tab', { name: 'Sources' }));
    const tab = screen.getByRole('tabpanel', { name: 'Sources' });
    await within(tab).findByText('transcript.txt');
    await pick([file('Plan.docx')]);
    expect(await within(tab).findByText('Plan.docx')).toBeTruthy();
    expect(s.desktop.sources.add).toHaveBeenCalled();
  });

  it('can remove an added file from its chip', async () => {
    await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    await pick([file('Plan.docx')]);
    await waitFor(() => expect(within(chips()).getByText('Plan.docx')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Remove Plan.docx' }));
    expect(screen.queryByRole('list', { name: 'Attached to your next message' })).toBeNull();
  });

  it('says so, and adds nothing, for too many files or one over 25 MB', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    await pick(Array.from({ length: 11 }, (_, i) => file(`f${i}.txt`)));
    expect(await screen.findByText(/room for 10 more/)).toBeTruthy();
    const big = file('big.pdf');
    Object.defineProperty(big, 'size', { value: 26_214_401 });
    await pick([big]);
    expect(
      await screen.findByText('A file is larger than 25 MB. Add a smaller copy.'),
    ).toBeTruthy();
    expect(s.desktop.sources.add).not.toHaveBeenCalled();
    // With the message full, none more.
    await pick(Array.from({ length: 10 }, (_, i) => file(`g${i}.txt`)));
    await waitFor(() => expect(s.desktop.sources.add).toHaveBeenCalledTimes(1));
    await pick([file('one-more.txt')]);
    expect(await screen.findByText(/already carries 10 things/)).toBeTruthy();
  });

  it('shows progress, then says in plain words when the shell refuses', async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    let fail: (error: Error) => void = () => undefined;
    s.desktop.sources.add.mockImplementationOnce(
      () => new Promise((_, reject) => void (fail = reject)),
    );
    await pick([file('Plan.docx')]);
    expect(await screen.findByText('Adding files…', { selector: 'p' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    // A second drop meanwhile is ignored, and Enter does not send.
    fireEvent.drop(panel(), dragOf(['Files'], [file('Again.docx')]));
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(s.agent.send).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('button', { name: 'Adding files…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => fail(new Error('sources.add failed')));
    expect(await screen.findByText(/The files could not be added/)).toBeTruthy();
    expect(log.error).toHaveBeenCalledWith('Files not added', expect.any(Error), {
      sessionId: s.id,
    });
    expect(screen.queryByRole('list', { name: 'Attached to your next message' })).toBeNull();
  });

  it('adds nothing when the agent cannot run', async () => {
    const s = await open({ status: { state: 'not_installed' } });
    await screen.findByText('Claude Code is not on this computer');
    const chat = document.querySelector('.ss-chat__panel') as HTMLElement;
    fireEvent.dragEnter(chat, dragOf(['Files']));
    fireEvent.dragOver(chat, dragOf(['Files']));
    fireEvent.dragLeave(chat, dragOf(['Files']));
    expect(screen.queryByText('Drop files to add them to this session')).toBeNull();
    fireEvent.drop(chat, dragOf(['Files'], [file('a.docx')]));
    fireEvent.paste(chat, { clipboardData: { files: [file('a.docx')] } });
    expect(s.desktop.sources.add).not.toHaveBeenCalled();
  });
});

describe("the chat's bottom bar", () => {
  const trigger = (name: RegExp | string) => screen.getByRole('button', { name });
  const pickFrom = async (menu: RegExp, item: string) => {
    fireEvent.click(trigger(menu));
    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^${item}`) }));
  };
  const startArgs = (s: { agent: { start: { mock: { calls: unknown[] } } } }, n: number) =>
    (s.agent.start.mock.calls[n] as unknown[] | undefined)?.[0];
  const ready = async () => {
    const s = await open();
    await waitFor(() => expect(box().value).toBe('Simplify the basics.'));
    return s;
  };

  it('shows the defaults, no context yet, and lists the skills without letting them be changed', async () => {
    await ready();
    expect(trigger('Model: Default model')).toBeTruthy();
    expect(trigger('Effort: Default effort')).toBeTruthy();
    expect(screen.queryByRole('progressbar', { name: 'Context used' })).toBeNull();
    fireEvent.click(trigger('Skills the agent has'));
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toEqual([
      'OutlineAgrees the plan first',
      'LessonWrites one lesson',
      'QuizQuestions from lessons',
      'HumanizePlain, checked writing',
    ]);
    expect(screen.getByText('What the agent knows how to do. Read-only.')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /^Outline/ }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('starts the agent again with the model and effort picked, resuming the chat, and keeps them', async () => {
    const s = await ready();
    await pickFrom(/^Model: Default/, 'Opus');
    await waitFor(() => expect(s.agent.start).toHaveBeenCalledTimes(2));
    expect(s.agent.close).toHaveBeenCalledWith(s.id);
    expect(s.agent.start).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'opus' }));
    expect(startArgs(s, 1)).not.toHaveProperty('effort');
    await screen.findByRole('button', { name: 'Model: Opus' });
    expect(JSON.parse(s.files.get(`u1/${s.id}/session.json`) as string)).toMatchObject({
      model: 'opus',
    });

    await pickFrom(/^Effort: Default/, 'Low');
    await waitFor(() => expect(s.agent.start).toHaveBeenCalledTimes(3));
    expect(s.agent.start).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: 'opus', effort: 'low' }),
    );
    fireEvent.click(trigger('Effort: Low'));
    expect(screen.getByRole('menuitem', { name: /^Low/ }).textContent).toContain('Selected');
    fireEvent.click(screen.getByRole('menuitem', { name: /^Default/ }));
    await waitFor(() => expect(s.agent.start).toHaveBeenCalledTimes(4));
    await screen.findByRole('button', { name: 'Effort: Default effort' });
    expect(startArgs(s, 3)).not.toHaveProperty('effort');
    expect(s.agent.start).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'opus' }));
    expect(log.info).toHaveBeenCalledWith('Agent model chosen', {
      sessionId: s.id,
      model: 'opus',
      effort: 'default',
    });
    await pickFrom(/^Model: Opus/, 'Default');
    await waitFor(() => expect(s.agent.start).toHaveBeenCalledTimes(5));
    await screen.findByRole('button', { name: 'Model: Default model' });
    expect(startArgs(s, 4)).not.toHaveProperty('model');
    expect(JSON.parse(s.files.get(`u1/${s.id}/session.json`) as string)).not.toHaveProperty(
      'model',
    );
    // A default is no key at all, so an older file reads the same.
    expect(JSON.parse(s.files.get(`u1/${s.id}/session.json`) as string)).not.toHaveProperty(
      'effort',
    );
  });

  it('starts with what the session file already holds', async () => {
    const fake = fakeDesktop();
    const store = createSessionStore({ desktop: fake.desktop, uid: 'u1', newId: () => 'held' });
    const started = await store.start({ kind: 'edit', courseId: 'git' }, async () =>
      draftDoc(GIT, { rev: 3 }),
    );
    if (started.status !== 'started') throw new Error('not started');
    await store.save({ ...started.session, model: 'haiku', effort: 'high' });
    const agent = fakeAgent(fake.desktop);
    installDesktop(fake.desktop);
    await openApp('/studio/sessions/held', { roles: ['educator'], studio: studio() });
    await screen.findByRole('button', { name: 'Model: Haiku' });
    expect(screen.getByRole('button', { name: 'Effort: High' })).toBeTruthy();
    await waitFor(() => expect(agent.agent.start).toHaveBeenCalled());
    expect(agent.agent.start).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'haiku', effort: 'high' }),
    );
  });

  it('says how full the context is once a turn reports it, and again empty after a change', async () => {
    const s = await ready();
    await send(s, 'Rename it');
    act(() =>
      s.emit({
        type: 'turn_end',
        agentSessionId: 'claude-1',
        outcome: 'done',
        context: { used: 46_000, window: 200_000 },
      }),
    );
    const ring = await screen.findByRole('progressbar', { name: 'Context used' });
    expect(ring.getAttribute('aria-valuenow')).toBe('23');
    expect(screen.getByText('23%')).toBeTruthy();
    await pickFrom(/^Model: Default/, 'Sonnet');
    await waitFor(() =>
      expect(screen.queryByRole('progressbar', { name: 'Context used' })).toBeNull(),
    );
  });

  it('caps the percentage at 100', async () => {
    const { contextPercent } = await import('../src/studio/session/ChatBar');
    expect(contextPercent(250_000, 200_000)).toBe(100);
    expect(contextPercent(1, 200_000)).toBe(0);
  });

  it('cannot change the model while a turn runs', async () => {
    const s = await ready();
    await send(s, 'Go');
    const model = screen.getByRole('button', { name: 'Model: Default model' });
    expect((model as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Effort: Default effort' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('keeps the old choice and says so when it cannot be saved', async () => {
    const s = await ready();
    s.desktop.store.write.mockRejectedValueOnce(new Error('store.write failed (EACCES)'));
    await pickFrom(/^Model: Default/, 'Opus');
    expect(await screen.findByText(/That choice could not be saved/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Model: Default model' })).toBeTruthy();
    expect(s.agent.start).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith('Session model not saved', expect.any(Object));
  });

  it('starts the new agent even when the old one cannot be told to end', async () => {
    const s = await ready();
    s.agent.close.mockRejectedValueOnce(new Error('agent.close failed'));
    await pickFrom(/^Model: Default/, 'Haiku');
    await waitFor(() => expect(s.agent.start).toHaveBeenCalledTimes(2));
    expect(log.warn).toHaveBeenCalledWith('Agent not closed', expect.any(Object));
  });

  it('shows the Sources folder in Finder, and logs when it cannot', async () => {
    const s = await ready();
    fireEvent.click(trigger('Show in Finder'));
    expect(s.desktop.sources.reveal).toHaveBeenCalledWith({ uid: 'u1', sessionId: s.id });
    s.desktop.sources.reveal.mockRejectedValueOnce(new Error('sources.reveal failed'));
    fireEvent.click(trigger('Show in Finder'));
    await waitFor(() =>
      expect(log.error).toHaveBeenCalledWith('Sources folder not shown', expect.any(Error), {
        sessionId: s.id,
      }),
    );
  });
});
