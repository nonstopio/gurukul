import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AuthoringSession, Course, Question, Quiz } from '@gurukul/schema';
import { courseChanges } from '@gurukul/schema/changes';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANSWER_CHECK_FILE, createSessionStore } from '../src/studio/session/store';
import type { Working } from '../src/studio/types';
import { axeViolations } from './axe';
import { makeCourse } from './fake-data';
import {
  AGENT_SESSION_ID,
  fakeAgent,
  fakeAsk,
  fakeDesktop,
  flushPromises,
  installDesktop,
  uninstallDesktop,
} from './fake-desktop';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';

/*
 * Review's Answers check (`DSK-18`) against the real session runtime and store over the fake
 * bridge: the second opinion on each changed Quiz question, "Check this answer" on its row, Ask the
 * agent to fix these, Skip answer check, and what it says when it cannot run.
 */

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

afterEach(() => {
  uninstallDesktop();
  vi.clearAllMocks();
});

const GIT: Course = makeCourse({ id: 'git', title: 'Git', educatorIds: ['u1'] });

const quizOf = (c: Course) =>
  c.chapters.flatMap((ch) => ch.items).find((i) => i.id === 'q1') as Quiz;

/** The turn: k1 reworded (key A), and k2 added (key B). */
function turn(w: Working): Working {
  const next = structuredClone(w);
  const quiz = quizOf(next.course);
  (quiz.questions[0] as Question).prompt = 'Which one is first?';
  quiz.questions.push({
    id: 'k2',
    kind: 'single',
    prompt: 'Which command rewrites history?',
    options: [
      { id: 'r', text: 'git rebase' },
      { id: 's', text: 'git status' },
    ],
    explanation: '',
  });
  next.answers = { q1: { k1: ['a'], k2: ['s'] } };
  return next;
}

let sessions = 0;

async function open(
  init: {
    edit?: (s: AuthoringSession) => AuthoringSession;
    path?: (id: string) => string;
    noAsk?: boolean;
    turns?: number;
    /** `answer-check.json` as an earlier visit left it. */
    answerFile?: unknown;
  } = {},
) {
  sessions += 1;
  const id = `a${sessions}`;
  const fake = fakeDesktop();
  const store = createSessionStore({ desktop: fake.desktop, uid: 'u1', newId: () => id });
  const started = await store.start({ kind: 'edit', courseId: 'git' }, async () =>
    draftDoc(GIT, { rev: 3, answers: { q1: { k1: ['a'] } } }),
  );
  if (started.status !== 'started') throw new Error('not started');
  let session = started.session;
  if ((init.turns ?? 1) > 0) {
    const before = session.work as Working;
    const after = turn(before);
    await store.saveStart(id, before);
    session = await store.saveTurn(
      session,
      {
        id: 't1',
        at: '2026-11-19T10:00:00.000Z',
        by: 'agent',
        summary: 'Turn 1',
        checkpoint: 't1.json',
        changes: courseChanges(before, after).count,
      },
      after,
    );
  }
  if (init.edit) await store.save(init.edit(session));
  if (init.answerFile !== undefined)
    fake.files.set(`u1/${id}/${ANSWER_CHECK_FILE}`, JSON.stringify(init.answerFile));
  const agent = fakeAgent(fake.desktop);
  const asks = fakeAsk(fake.desktop);
  if (init.noAsk) delete (fake.desktop.agent as { ask?: unknown }).ask;
  installDesktop(fake.desktop);
  const studio = fakeStudio({ courses: [{ live: GIT, draft: draftDoc(GIT) }] });
  await openApp(init.path?.(id) ?? `/studio/sessions/${id}/review`, {
    roles: ['educator'],
    studio,
  });
  return { ...fake, ...agent, ...asks, id };
}

const checks = () => screen.getByRole('region', { name: 'Checks' });
const findChecks = () => screen.findByRole('region', { name: 'Checks' });
/** The Answers line of the checks, apart from Writing's own Show and Ask buttons. */
const answersLine = () =>
  within(
    within(checks())
      .getByText(/^Answers: /)
      .closest('li') as HTMLElement,
  );
const list = () => screen.getByRole('list', { name: 'Changes' });
const detail = () => screen.getByRole('region', { name: 'The selected change' });

describe('Review’s answer check', () => {
  it('asks a second opinion on each changed question, shows progress, and flags a disagreement', async () => {
    const s = await open();
    await waitFor(() => expect(s.waiting()).toHaveLength(2));
    // The prompt carries the question, never the key's option ids.
    expect(s.waiting()[1]).toContain('Which command rewrites history?');
    expect(await within(await findChecks()).findByText('Answers: 0 of 2 checked')).toBeTruthy();
    expect(within(checks()).getByRole('progressbar', { name: 'Answer check' })).toBeTruthy();
    expect(within(checks()).getByRole('button', { name: 'Skip answer check' })).toBeTruthy();

    s.reply(['A'], 'Which one is first?');
    await flushPromises();
    expect(await within(await findChecks()).findByText('Answers: 1 of 2 checked')).toBeTruthy();
    s.reply(['A'], 'rewrites history', 'Rebase replays commits.');
    await flushPromises();

    expect(await within(await findChecks()).findByText('Answers: 1 answer to check')).toBeTruthy();
    const finding = within(checks()).getByText(
      'Quiz 2.2 · Question 2: A second opinion chose A; the key says B. “Rebase replays commits.”',
    );
    expect(finding).toBeTruthy();
    expect(within(checks()).queryByRole('progressbar')).toBeNull();
    expect(within(checks()).queryByRole('button', { name: 'Skip answer check' })).toBeNull();

    // The Quiz's row says so, in words.
    const row = within(list()).getByRole('button', { name: /^2\.2 · Quiz I/ });
    expect(row.textContent).toContain('Check this answer');
    expect(row.textContent).toContain(', check this answer');
    fireEvent.click(answersLine().getByRole('button', { name: 'Show 2.2 · Quiz I' }));
    expect(within(detail()).getByText('Check this answer')).toBeTruthy();
    expect(
      within(detail()).getByText(
        'Question 2: A second opinion chose A; the key says B. “Rebase replays commits.”',
      ),
    ).toBeTruthy();
    // Kept on this computer by the question's hash.
    const saved = JSON.parse(s.files.get(`u1/${s.id}/${ANSWER_CHECK_FILE}`) as string) as {
      results: unknown[];
    };
    expect(saved.results).toHaveLength(2);
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('says when it waits because the app’s two places are taken by another session’s check', async () => {
    const s = await open();
    await waitFor(() => expect(s.waiting()).toHaveLength(2));
    await findChecks();
    expect(answersLine().queryByText(/^Waiting for a free place/)).toBeNull();
    s.answer({ ok: false, error: { code: 'busy' } }, 'Which one is first?');
    s.answer({ ok: false, error: { code: 'busy' } }, 'rewrites history');
    await flushPromises();
    expect(
      await answersLine().findByText(
        'Waiting for a free place: the app checks two answers at a time, and both are in use elsewhere (another session’s check, or a page you left). This check goes on by itself.',
      ),
    ).toBeTruthy();
    // Still no failure: the progress stays, and nothing offers Try again.
    expect(within(checks()).getByText('Answers: 0 of 2 checked')).toBeTruthy();
    expect(answersLine().queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('puts the chips on a line of their own rather than squeezing a Quiz’s name onto two', async () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(resolve(import.meta.dirname, '../src/studio.css'), 'utf8');
    document.head.append(style);
    try {
      const s = await open();
      await waitFor(() => expect(s.waiting()).toHaveLength(2));
      s.reply(['A'], 'Which one is first?');
      s.reply(['A'], 'rewrites history');
      await flushPromises();
      const row = await within(list()).findByRole('button', { name: /^2\.2 · Quiz I/ });
      await waitFor(() => expect(row.textContent).toContain('Check this answer'));
      // The row wraps, and the name is laid out at its own width: "Changed" and "Check this
      // answer" no longer fit beside it in the list at 1024px, so they move under it.
      expect(getComputedStyle(row).flexWrap).toBe('wrap');
      const name = within(row).getByText('2.2 · Quiz I');
      expect(getComputedStyle(name).flexBasis).toBe('auto');
      expect(getComputedStyle(name).flexGrow).toBe('1');
    } finally {
      style.remove();
    }
  });

  it('sends the disagreements to the agent with the questions attached', async () => {
    const s = await open();
    await waitFor(() => expect(s.waiting()).toHaveLength(2));
    s.reply(['B'], 'Which one is first?', '');
    await flushPromises();
    s.reply(['A'], 'rewrites history');
    await flushPromises();
    expect(await within(await findChecks()).findByText('Answers: 2 answers to check')).toBeTruthy();
    expect(
      within(checks()).getByText(
        'Quiz 2.2 · Question 1: A second opinion chose B; the key says A.',
      ),
    ).toBeTruthy();
    fireEvent.click(answersLine().getByRole('button', { name: 'Ask the agent to fix these' }));
    const box = (await screen.findByRole('textbox', {
      name: 'Ask for a change',
    })) as HTMLTextAreaElement;
    expect(box.value).toContain('disagreed with the key on the attached questions');
    expect(box.value).toContain(
      '- Quiz 2.2 · Question 2: A second opinion chose A; the key says B.',
    );
    expect(screen.getByText('Quiz 2.2 · Question 1')).toBeTruthy();
    expect(screen.getByText('Quiz 2.2 · Question 2')).toBeTruthy();
  });

  it('stops on Skip answer check for the session, and starts again on Check answers', async () => {
    const s = await open();
    await waitFor(() => expect(s.waiting()).toHaveLength(2));
    fireEvent.click(await within(checks()).findByRole('button', { name: 'Skip answer check' }));
    expect(
      await within(await findChecks()).findByText('Answers: skipped for this session'),
    ).toBeTruthy();
    await waitFor(() => expect(s.cancelAsk).toHaveBeenCalledTimes(2));
    expect(s.waiting()).toEqual([]);
    fireEvent.click(within(checks()).getByRole('button', { name: 'Check answers' }));
    await waitFor(() => expect(s.waiting()).toHaveLength(2));
    expect(await within(await findChecks()).findByText('Answers: 0 of 2 checked')).toBeTruthy();
  });

  it('keeps the disagreements already found after Skip, with Ask the agent to fix these', async () => {
    const s = await open();
    await waitFor(() => expect(s.waiting()).toHaveLength(2));
    s.reply(['B'], 'Which one is first?', 'Order matters.');
    await flushPromises();
    // The other question is still being asked when the Educator skips.
    fireEvent.click(await within(checks()).findByRole('button', { name: 'Skip answer check' }));
    expect(
      await within(await findChecks()).findByText(
        'Answers: skipped for this session · 1 answer to check',
      ),
    ).toBeTruthy();
    await waitFor(() => expect(s.cancelAsk).toHaveBeenCalledTimes(1));
    // The same disagreement the row shows is in the check, with the way to send it to the agent.
    const row = within(list()).getByRole('button', { name: /^2\.2 · Quiz I/ });
    expect(row.textContent).toContain('Check this answer');
    expect(
      answersLine().getByText(
        'Quiz 2.2 · Question 1: A second opinion chose B; the key says A. “Order matters.”',
      ),
    ).toBeTruthy();
    expect(answersLine().getByText(/Those already given are kept\./)).toBeTruthy();
    fireEvent.click(answersLine().getByRole('button', { name: 'Ask the agent to fix these' }));
    const box = (await screen.findByRole('textbox', {
      name: 'Ask for a change',
    })) as HTMLTextAreaElement;
    expect(box.value).toContain(
      '- Quiz 2.2 · Question 1: A second opinion chose B; the key says A. “Order matters.”',
    );
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('shows a question it could not check, and asks again on Try again', async () => {
    const s = await open();
    await waitFor(() => expect(s.waiting()).toHaveLength(2));
    s.answer({ ok: false, error: { code: 'timeout' } }, 'Which one is first?');
    await flushPromises();
    s.reply(['B'], 'rewrites history');
    await flushPromises();
    expect(await within(await findChecks()).findByText('Answers: 1 not checked')).toBeTruthy();
    expect(
      within(checks()).getByText('Quiz 2.2 · Question 1: No second opinion. It took too long.'),
    ).toBeTruthy();
    fireEvent.click(within(checks()).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(s.waiting()).toHaveLength(1));
    s.reply(['A']);
    await flushPromises();
    expect(
      await within(await findChecks()).findByText('Answers: 2 checked, all agree'),
    ).toBeTruthy();
  });

  it('says what to do when Claude Code cannot answer, and tries again', async () => {
    const s = await open();
    await waitFor(() => expect(s.waiting()).toHaveLength(2));
    s.answer({ ok: false, error: { code: 'not_signed_in' } }, 'Which one is first?');
    await flushPromises();
    const help = await within(await findChecks()).findByText(/run/);
    expect(help.textContent).toBe('Open a terminal, run claude and sign in, then try again.');
    expect(help.querySelector('code')?.textContent).toBe('claude');
    s.answer({ ok: false, error: { code: 'cancelled' } });
    await flushPromises();
    fireEvent.click(within(checks()).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(s.waiting()).toHaveLength(2));
  });

  it.each([
    [
      { code: 'not_installed' as const },
      'Claude Code is not on this computer, so no second opinion can be asked for.',
    ],
    [
      { code: 'too_old' as const, version: '2.0.0', minimumVersion: '2.1.328' },
      /^Claude Code 2\.0\.0 is older than this app needs \(2\.1\.328\)\. Open a terminal, run/,
    ],
    [
      { code: 'plan_limit' as const, resetsAt: null },
      'Your Claude plan has reached its limit for now. Try again once it resets.',
    ],
  ])('explains %o', async (error, words) => {
    const s = await open();
    await waitFor(() => expect(s.waiting()).toHaveLength(2));
    s.answer({ ok: false, error });
    await flushPromises();
    expect(await within(await findChecks()).findByText(words)).toBeTruthy();
  });

  it('asks for the app’s update when the shell has no ask', async () => {
    await open({ noAsk: true });
    expect(
      await within(await findChecks()).findByText(
        'This version of Gurukul Studio cannot ask for a second opinion. Update the app, then open Review again.',
      ),
    ).toBeTruthy();
    expect(within(checks()).getByRole('button', { name: 'Update the app' })).toBeTruthy();
  });

  it('waits while a turn runs, then checks', async () => {
    const s = await open({ path: (id) => `/studio/sessions/${id}` });
    const box = (await screen.findByRole('textbox', {
      name: 'Ask for a change',
    })) as HTMLTextAreaElement;
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy());
    fireEvent.change(box, { target: { value: 'Go on.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(s.agent.send).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('link', { name: 'Review' }));
    expect(
      await within(await screen.findByRole('region', { name: 'Checks' })).findByText(
        'The check waits until the agent finishes its turn and your edits are kept.',
      ),
    ).toBeTruthy();
    expect(s.ask).not.toHaveBeenCalled();
    s.emit({
      type: 'turn_end',
      sessionId: s.id,
      agentSessionId: AGENT_SESSION_ID,
      outcome: 'done',
    });
    await waitFor(() => expect(s.waiting()).toHaveLength(2));
  });

  it('shows what a closed session found, and asks nothing', async () => {
    await open({ edit: (x) => ({ ...x, status: 'saved' }) });
    expect(
      await within(await findChecks()).findByText(
        'This session is closed, so the rest were not checked.',
      ),
    ).toBeTruthy();
    expect(within(checks()).queryByRole('button', { name: 'Skip answer check' })).toBeNull();
  });

  it('says nothing changed when no question did', async () => {
    const s = await open({ turns: 0 });
    expect(
      await within(await findChecks()).findByText('Answers: no Quiz questions changed'),
    ).toBeTruthy();
    expect(s.ask).not.toHaveBeenCalled();
  });

  it('remembers a skip, and offers no Check answers once the session is closed', async () => {
    const file = { schemaVersion: 1, skipped: true, results: [] };
    const s = await open({ answerFile: file });
    expect(
      await within(await findChecks()).findByText('Answers: skipped for this session'),
    ).toBeTruthy();
    expect(within(checks()).getByRole('button', { name: 'Check answers' })).toBeTruthy();
    expect(s.ask).not.toHaveBeenCalled();
    cleanup();
    await open({ answerFile: file, edit: (x) => ({ ...x, status: 'discarded' }) });
    expect(
      await within(await findChecks()).findByText('Answers: skipped for this session'),
    ).toBeTruthy();
    expect(within(checks()).queryByRole('button', { name: 'Check answers' })).toBeNull();
  });
});
