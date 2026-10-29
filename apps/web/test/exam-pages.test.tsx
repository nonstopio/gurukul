import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Course } from '@gurukul/schema';
import { draftKey } from '../src/pariksha/draftStore';
import { CooldownError } from '../src/pariksha/service';
import { axeViolations } from './axe';
import { attemptRow, certificateRow, fakeData, makeCourse, progressRow } from './fake-data';
import { attemptResult, fakePariksha } from './fake-pariksha';
import { openApp } from './harness';

const question = (id: string, over: object = {}) => ({
  id,
  kind: 'single' as const,
  prompt: `Question ${id}?`,
  options: [
    { id: 'a', text: 'Alpha' },
    { id: 'b', text: 'Beta' },
    { id: 'c', text: 'Gamma' },
  ],
  explanation: 'Because.',
  reviewItemId: 'l1',
  ...over,
});

function courseWith(pariksha: object = {}, questions = [question('k1'), question('k2')]): Course {
  const c = makeCourse();
  const p = c.parvas[1]?.items[1];
  if (p?.type === 'pariksha')
    Object.assign(p, { questions, questionsShown: questions.length, ...pariksha });
  return c;
}
const unlocked = (over = {}) =>
  progressRow({ completedItemIds: ['l1', 'l2', 'l3'], lastItemId: 'l3', ...over });
const PATH = '/courses/git/pariksha/q1';
const data = (course = courseWith(), watched = unlocked()) =>
  fakeData({ courses: [course], watched });
/**
 * Lets the screen's effects run (key listener, draft save, countdown interval). `findBy*` can
 * return before them: it ends on a timeout, React runs effects in a setImmediate task queued
 * earlier, and on a busy machine the timeout fires first. An immediate queued now runs after it.
 */
const effectsRun = () => act(() => new Promise<void>((resolve) => setImmediate(resolve)));

// These screens are lazy routes. Load them before the tests, so a busy machine's first transform of
// them does not use up the first test's one-second wait for the screen.
beforeAll(() =>
  Promise.all([
    import('../src/pariksha/ParikshaPage'),
    import('../src/pariksha/ResultPage'),
    import('../src/certificates/pages'),
    import('../src/LessonPage'),
  ]),
);

describe('Pariksha screen', () => {
  it('asks one question at a time and checks each answer when answers are revealed', async () => {
    const pariksha = fakePariksha({
      checkAnswer: vi
        .fn()
        .mockResolvedValue({ correct: false, correctOptionIds: ['b'], explanation: 'Beta wins.' }),
    });
    await openApp(PATH, { data: data(courseWith({ cooldownMinutes: 10 })), pariksha });
    expect(await screen.findByText('Question 1 of 2')).toBeTruthy();
    expect(screen.getByText(/Retakes allowed after 10 minutes/)).toBeTruthy();
    const primary = screen.getByRole('button', { name: 'Check answer' }) as HTMLButtonElement;
    expect(primary.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Alpha/));
    fireEvent.click(primary);
    expect(await screen.findByText('Not quite — the answer is B.')).toBeTruthy();
    expect(screen.getByText('Beta wins.', { exact: false })).toBeTruthy();
    expect(pariksha.checkAnswer).toHaveBeenCalledWith({
      courseId: 'git',
      parikshaId: 'q1',
      questionId: 'k1',
      selected: ['a'],
    });
    expect(
      within(screen.getByLabelText(/Beta/).closest('label') as HTMLElement).getByText('Correct'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));
    expect(screen.getByText('Question 2 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Question 1 of 2')).toBeTruthy();
  });

  it('submits at the end and shows the result', async () => {
    const pariksha = fakePariksha({
      checkAnswer: vi
        .fn()
        .mockResolvedValue({ correct: true, correctOptionIds: ['a'], explanation: 'Yes.' }),
      gradeAttempt: vi.fn().mockResolvedValue(
        attemptResult({
          score: 0.5,
          correctCount: 1,
          total: 2,
          passed: false,
          nextAttemptAt: Date.now() + 10 * 60_000,
          results: [
            { questionId: 'k1', correct: true, correctOptionIds: ['a'], explanation: 'Yes.' },
            { questionId: 'k2', correct: false, correctOptionIds: ['b'], explanation: 'Beta.' },
          ],
        }),
      ),
    });
    const { router } = await openApp(PATH, { data: data(), pariksha });
    for (const label of [/Alpha/, /Alpha/]) {
      await screen.findByText(/Question \d of 2/);
      fireEvent.click(screen.getByLabelText(label));
      const check = screen.getByRole('button', { name: 'Check answer' });
      fireEvent.click(check);
      await screen.findByRole('status');
      fireEvent.click(screen.getByRole('button', { name: /Next question|Finish Pariksha/ }));
    }
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/courses/git/pariksha/q1/result'),
    );
    expect(pariksha.gradeAttempt).toHaveBeenCalledWith({
      courseId: 'git',
      parikshaId: 'q1',
      questionIds: ['k1', 'k2'],
      answers: { k1: ['a'], k2: ['a'] },
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Not this time.' })).toBeTruthy();
    expect(screen.getByText('Not passed yet')).toBeTruthy();
    expect(screen.getByText(/1 of 2 correctly \(50%\)/)).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toMatch(/^Retake opens in (10:00|9:5\d)$/);
    expect(screen.getByRole('link', { name: 'Revisit lessons' }).getAttribute('href')).toBe(
      '/courses/git/learn/l1',
    );
    expect(screen.getByText('Beta.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Revisit lesson: Lesson l1' })).toBeTruthy();
  });

  it('goes straight to the next question when answers are not revealed, with multi-select', async () => {
    const course = courseWith({ revealAnswers: 'never', passMark: 0.5, cooldownMinutes: 0 }, [
      question('k1', { kind: 'multiple', code: 'git status' }),
      question('k2'),
    ]);
    const pariksha = fakePariksha();
    await openApp(PATH, { data: data(course), pariksha });
    await screen.findByText('Question 1 of 2');
    expect(screen.getByText(/Retakes allowed straight away/)).toBeTruthy();
    expect(screen.getByText(/Pass mark 50%/)).toBeTruthy();
    expect(document.querySelector('pre code')?.textContent).toBe('git status');
    fireEvent.click(screen.getByLabelText(/Alpha/));
    fireEvent.click(screen.getByLabelText(/Beta/));
    fireEvent.click(screen.getByLabelText(/Alpha/));
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));
    expect(pariksha.checkAnswer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/Gamma/));
    fireEvent.click(screen.getByRole('button', { name: 'Finish Pariksha' }));
    await waitFor(() =>
      expect(pariksha.gradeAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ answers: { k1: ['b'], k2: ['c'] } }),
      ),
    );
  });

  it('chooses answers with the number and letter keys', async () => {
    const course = courseWith({ revealAnswers: 'never' }, [question('k1', { kind: 'multiple' })]);
    await openApp(PATH, { data: data(course) });
    await screen.findByText('Question 1 of 1');
    await effectsRun(); // the key listener
    fireEvent.keyDown(document.body.querySelector('main') as HTMLElement, { key: '2' });
    expect((screen.getByLabelText(/Beta/) as HTMLInputElement).checked).toBe(true);
    fireEvent.keyDown(document.body.querySelector('main') as HTMLElement, { key: 'C' });
    expect((screen.getByLabelText(/Gamma/) as HTMLInputElement).checked).toBe(true);
    fireEvent.keyDown(document.body.querySelector('main') as HTMLElement, { key: '9' });
    fireEvent.keyDown(document.body.querySelector('main') as HTMLElement, { key: '4' });
    fireEvent.keyDown(document.body.querySelector('main') as HTMLElement, {
      key: '1',
      ctrlKey: true,
    });
    expect((screen.getByLabelText(/Alpha/) as HTMLInputElement).checked).toBe(false);
  });

  it('chooses a single answer with a key, replacing the previous one', async () => {
    const course = courseWith({ revealAnswers: 'never' }, [question('k1')]);
    await openApp(PATH, { data: data(course) });
    await screen.findByText('Question 1 of 1');
    await effectsRun(); // the key listener
    const main = document.body.querySelector('main') as HTMLElement;
    fireEvent.keyDown(main, { key: '1' });
    fireEvent.keyDown(main, { key: 'b' });
    expect((screen.getByLabelText(/Alpha/) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/Beta/) as HTMLInputElement).checked).toBe(true);
  });

  it('keeps the selection and says so when a check or the submit fails', async () => {
    const pariksha = fakePariksha({
      checkAnswer: vi.fn().mockRejectedValue(new Error('offline')),
      gradeAttempt: vi
        .fn()
        .mockRejectedValueOnce(new CooldownError(null))
        .mockRejectedValueOnce(new Error('x')),
    });
    await openApp(PATH, { data: data(courseWith({}, [question('k1')])), pariksha });
    await screen.findByText('Question 1 of 1');
    fireEvent.click(screen.getByLabelText(/Alpha/));
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(await screen.findByText('Could not check your answer. Try again.')).toBeTruthy();
    expect((screen.getByLabelText(/Alpha/) as HTMLInputElement).checked).toBe(true);
  });

  it('reports a rejected submission', async () => {
    const pariksha = fakePariksha({
      gradeAttempt: vi
        .fn()
        .mockRejectedValueOnce(new CooldownError(null))
        .mockRejectedValueOnce(new Error('x')),
    });
    const course = courseWith({ revealAnswers: 'never' }, [question('k1')]);
    await openApp(PATH, { data: data(course), pariksha });
    await screen.findByText('Question 1 of 1');
    fireEvent.click(screen.getByLabelText(/Alpha/));
    fireEvent.click(screen.getByRole('button', { name: 'Finish Pariksha' }));
    expect(await screen.findByText(/retake is not open yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Finish Pariksha' }));
    expect(await screen.findByText('Could not submit your answers. Try again.')).toBeTruthy();
  });

  it('closes the Pariksha of a retired course instead of drawing questions', async () => {
    const course = courseWith();
    course.status = 'archived';
    await openApp(PATH, { data: data(course) });
    expect(await screen.findByText('This course is retired')).toBeTruthy();
    expect(screen.queryByText('Question k1?')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to the outline' }).getAttribute('href')).toBe(
      '/courses/git',
    );
  });

  it('explains a locked Pariksha and an unfinished cooldown', async () => {
    const { unmount } = await openApp(PATH, {
      data: data(courseWith(), progressRow({ lastItemId: 'l1' })),
    });
    expect(await screen.findByText('Locked for now')).toBeTruthy();
    unmount();
    const recent = new Date(Date.now() - 2 * 60_000);
    await openApp(PATH, {
      data: data(
        courseWith({ cooldownMinutes: 10 }),
        unlocked({
          pariksha: { q1: { best: 0.2, passed: false, attempts: 1, lastAttemptAt: recent } },
        }),
      ),
    });
    expect(await screen.findByText('Retake not open yet')).toBeTruthy();
    expect(screen.getByText(/You can retake this in 8 minutes/)).toBeTruthy();
  });

  it('shows nothing until the progress document arrives, and locks a course that was never started', async () => {
    const d = fakeData({ courses: [courseWith()], deferProgress: true });
    await openApp(PATH, { data: d });
    await waitFor(() => expect(d.data.getCourse).toHaveBeenCalled());
    // Let the course finish loading, so the page has rendered with the progress still pending.
    await act(async () => {
      await vi.mocked(d.data.getCourse).mock.results[0]?.value;
    });
    expect(screen.queryByText(/Question 1/)).toBeNull();
    act(() => d.emitProgress(null));
    expect(await screen.findByText('Locked for now')).toBeTruthy();
  });

  it('sends an unknown Pariksha or course to the catalogue', async () => {
    const { router, unmount } = await openApp('/courses/git/pariksha/nope', { data: data() });
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses'));
    unmount();
    const second = await openApp('/courses/zzz/pariksha/q1', { data: data() });
    await waitFor(() => expect(second.router.state.location.pathname).toBe('/courses'));
  });

  it('names every right letter, and none when the verdict names unknown options', async () => {
    const course = courseWith({}, [question('k1', { kind: 'multiple' }), question('k2')]);
    const pariksha = fakePariksha({
      checkAnswer: vi
        .fn()
        .mockResolvedValueOnce({ correct: false, correctOptionIds: ['c', 'a'], explanation: '' })
        .mockResolvedValueOnce({ correct: false, correctOptionIds: ['zzz'], explanation: '' }),
    });
    await openApp(PATH, { data: data(course), pariksha });
    await screen.findByText('Question 1 of 2');
    fireEvent.click(screen.getByLabelText(/Beta/));
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(await screen.findByText('Not quite — the answers are A and C.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));
    fireEvent.click(screen.getByLabelText(/Beta/));
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(await screen.findByText('Not quite.')).toBeTruthy();
  });

  it('checks with Enter, then advances with Enter, and leaves Enter on a button to the button', async () => {
    const { pariksha } = await openApp(PATH, { data: data() });
    await screen.findByText('Question 1 of 2');
    await effectsRun(); // the key listener
    const main = document.body.querySelector('main') as HTMLElement;
    fireEvent.keyDown(main, { key: 'Enter' });
    expect(pariksha.checkAnswer).not.toHaveBeenCalled();
    fireEvent.keyDown(main, { key: '1' });
    fireEvent.keyDown(main, { key: 'Enter' });
    expect(await screen.findByText('Correct.')).toBeTruthy();
    await effectsRun(); // the key listener sees the verdict
    fireEvent.keyDown(main, { key: '2' }); // a checked answer is final
    expect((screen.getByLabelText(/Beta/) as HTMLInputElement).checked).toBe(false);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Next question' }), { key: 'Enter' });
    expect(screen.getByText('Question 1 of 2')).toBeTruthy();
    fireEvent.keyDown(main, { key: 'Enter' });
    expect(screen.getByText('Question 2 of 2')).toBeTruthy();
  });

  it('locks the options while an answer is being checked', async () => {
    let resolve: (v: unknown) => void = () => {};
    const pariksha = fakePariksha({
      checkAnswer: vi.fn().mockReturnValue(new Promise((r) => (resolve = r))),
    });
    await openApp(PATH, { data: data(), pariksha });
    await screen.findByText('Question 1 of 2');
    fireEvent.click(screen.getByLabelText(/Alpha/));
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect((document.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    fireEvent.keyDown(document.body.querySelector('main') as HTMLElement, { key: '2' });
    expect((screen.getByLabelText(/Alpha/) as HTMLInputElement).checked).toBe(true);
    await act(async () => resolve({ correct: true, correctOptionIds: ['a'], explanation: '' }));
    expect((document.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(false);
  });

  it('carries on after a reload with the same questions, answers and verdicts', async () => {
    const course = courseWith({}, [question('k1'), question('k2'), question('k3')]);
    const pariksha = fakePariksha({
      checkAnswer: vi
        .fn()
        .mockResolvedValue({ correct: false, correctOptionIds: ['b'], explanation: 'Beta.' }),
    });
    const first = await openApp(PATH, { data: data(course), pariksha });
    await screen.findByText('Question 1 of 3');
    fireEvent.click(screen.getByLabelText(/Alpha/));
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));
    fireEvent.click(screen.getByLabelText(/Gamma/)); // picked, never checked
    first.unmount();

    await openApp(PATH, { data: data(course), pariksha });
    expect(await screen.findByText('Question 2 of 3')).toBeTruthy();
    expect((screen.getByLabelText(/Gamma/) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect((screen.getByLabelText(/Alpha/) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Not quite — the answer is B.')).toBeTruthy();
    expect((screen.getByLabelText(/Beta/) as HTMLInputElement).disabled).toBe(true);
  });

  it('forgets the draft once the attempt is graded, and ignores a stale or outdated one', async () => {
    const key = draftKey('u1', 'git', 'q1');
    const course = courseWith({ revealAnswers: 'never' }, [question('k1')]);
    const first = await openApp(PATH, { data: data(course) });
    await screen.findByText('Question 1 of 1');
    await effectsRun(); // the draft save
    expect(localStorage.getItem(key)).not.toBeNull();
    fireEvent.click(screen.getByLabelText(/Alpha/));
    fireEvent.click(screen.getByRole('button', { name: 'Finish Pariksha' }));
    await waitFor(() => expect(localStorage.getItem(key)).toBeNull());
    first.unmount();

    const draft = (startedAt: number, order: object[]) =>
      localStorage.setItem(
        key,
        JSON.stringify({ startedAt, order, index: 1, answers: { k1: ['a'] }, feedback: {} }),
      );
    const two = courseWith({ revealAnswers: 'never' });
    const order = [
      { id: 'k1', optionIds: ['a', 'b', 'c'] },
      { id: 'k2', optionIds: ['a', 'b', 'c'] },
    ];
    // Older than the last graded attempt: that attempt's draft, so a fresh start.
    draft(Date.now() - 3_600_000, order);
    const graded = unlocked({
      pariksha: { q1: { best: 0, passed: false, attempts: 1, lastAttemptAt: new Date() } },
    });
    const second = await openApp(PATH, { data: data(two, graded) });
    expect(await screen.findByText('Question 1 of 2')).toBeTruthy();
    expect((screen.getByLabelText(/Alpha/) as HTMLInputElement).checked).toBe(false);
    second.unmount();
    // The Acharya removed a question since: a fresh start too.
    draft(Date.now(), [{ id: 'gone', optionIds: ['a'] }]);
    await openApp(PATH, { data: data(two) });
    expect(await screen.findByText('Question 1 of 2')).toBeTruthy();
  });

  it('asks before leaving with an unsaved answer, and leaves at once without one', async () => {
    const { router, unmount } = await openApp(PATH, { data: data() });
    await screen.findByText('Question 1 of 2');
    fireEvent.click(screen.getByLabelText(/Alpha/));
    fireEvent.click(screen.getByRole('link', { name: 'Exit Pariksha' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave this Pariksha?' });
    await act(async () => {});
    fireEvent.keyDown(dialog, { key: '2' });
    expect((screen.getByLabelText(/Alpha/) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Exit Pariksha' }));
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe(PATH);
    fireEvent.click(screen.getByRole('link', { name: 'Exit Pariksha' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git'));
    unmount();

    const second = await openApp(PATH, { data: data() });
    await screen.findByText('Question 1 of 2');
    fireEvent.click(screen.getByRole('link', { name: 'Exit Pariksha' }));
    await waitFor(() => expect(second.router.state.location.pathname).toBe('/courses/git'));
  });

  it('has no axe violations', async () => {
    const { container } = await openApp(PATH, { data: data() });
    await screen.findByText('Question 1 of 2');
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Result screen', () => {
  const RESULT = '/courses/git/pariksha/q1/result';
  const passedState = {
    result: attemptResult({ correctCount: 1, total: 1 }),
    questions: [question('k1')],
    answers: { k1: ['a'] },
  };

  it('celebrates a pass and continues to the next lesson', async () => {
    await openApp({ pathname: RESULT, state: passedState }, { data: data() });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Pariksha I cleared.' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Continue' }).getAttribute('href')).toBe(
      '/courses/git/learn/l4',
    );
    expect(screen.getByRole('link', { name: 'Retake' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Revisit lesson:/ })).toBeNull();
  });

  it('finishes the course when the Pariksha is the last item', async () => {
    const c = courseWith();
    c.parvas[1]?.items.pop();
    await openApp({ pathname: RESULT, state: passedState }, { data: data(c) });
    expect(
      await screen
        .findByRole('link', { name: 'Finish course' })
        .then((l) => l.getAttribute('href')),
    ).toBe('/courses/git/complete');
  });

  it('continues to the next parva by number when the Pariksha ends its parva', async () => {
    const c = courseWith();
    const moved = c.parvas[1]?.items.pop();
    c.parvas.push({ id: 'p3', title: 'Remotes', items: moved ? [moved] : [] });
    await openApp({ pathname: RESULT, state: passedState }, { data: data(c) });
    const link = await screen.findByRole('link', { name: 'Continue to Parva 3' });
    expect(link.getAttribute('href')).toBe('/courses/git/learn/l4');
  });

  it('rebuilds the review from the latest attempt after a reload', async () => {
    const c = courseWith({ cooldownMinutes: 10 }, [
      question('k1'),
      question('k2', { reviewItemId: 'gone' }),
    ]);
    const attempt = attemptRow({
      score: 0,
      correctCount: 0,
      total: 3,
      passed: false,
      questionIds: ['k1', 'removed', 'k2'],
      answers: { k1: ['b'] },
      results: [
        { questionId: 'k1', correct: false },
        { questionId: 'removed', correct: false },
        { questionId: 'k2', correct: false },
      ],
    });
    const watched = unlocked({
      pariksha: {
        q1: { best: 0, passed: false, attempts: 1, lastAttemptAt: new Date(Date.now() - 60_000) },
      },
    });
    const learner = fakeData({ courses: [c], watched, attempt });
    await openApp(RESULT, { data: learner });
    expect(await screen.findByText(/0 of 3 correctly \(0%\)/)).toBeTruthy();
    expect(learner.data.latestAttempt).toHaveBeenCalledWith('u1', 'git', 'q1');
    expect(screen.getByRole('heading', { name: 'Review' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByText('No answer')).toBeTruthy();
    expect(screen.getAllByText('Because.')).toHaveLength(2);
    expect(screen.queryByText('Correct answer')).toBeNull();
    expect(screen.getByRole('link', { name: 'Revisit lesson: Lesson l1' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /Revisit lesson:/ })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Revisit lessons' }).getAttribute('href')).toBe(
      '/courses/git/learn/l1',
    );
    expect(screen.getByRole('timer').textContent).toMatch(/^Retake opens in (9:00|8:5\d)$/);
  });

  it('hides explanations a failed attempt may not reveal, and sends a revisit with no lesson to the outline', async () => {
    for (const revealAnswers of ['onPass', 'never'] as const) {
      const c = courseWith({ revealAnswers }, [question('k1', { reviewItemId: 'gone' })]);
      const attempt = attemptRow({ passed: false, score: 0, correctCount: 0 });
      const { unmount } = await openApp(RESULT, { data: fakeData({ courses: [c], attempt }) });
      expect(await screen.findByText(/0 of 1 correctly/)).toBeTruthy();
      expect(screen.queryByText('Because.')).toBeNull();
      expect(screen.getByRole('link', { name: 'Revisit lessons' }).getAttribute('href')).toBe(
        '/courses/git',
      );
      unmount();
    }
    const c = courseWith({ revealAnswers: 'onPass' }, [question('k1')]);
    await openApp(RESULT, { data: fakeData({ courses: [c], attempt: attemptRow() }) });
    expect(await screen.findByText('Because.')).toBeTruthy();
  });

  it('falls back to the saved summary when the attempt cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const learner = data();
    vi.mocked(learner.data.latestAttempt).mockRejectedValue(new Error('missing index'));
    await openApp(RESULT, { data: learner });
    expect(await screen.findByText('Your best score is 0%.')).toBeTruthy();
    expect(warn).toHaveBeenCalledWith('Latest attempt unreadable, showing the summary', {
      courseId: 'git',
      parikshaId: 'q1',
    });
    warn.mockRestore();
  });

  it('counts down to the retake each second and then offers it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      const state = {
        ...passedState,
        result: attemptResult({ nextAttemptAt: Date.now() + 61_500 }),
      };
      await openApp({ pathname: RESULT, state }, { data: data() });
      expect((await screen.findByRole('timer')).textContent).toBe('Retake opens in 1:02');
      await effectsRun(); // the interval
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByRole('timer').textContent).toBe('Retake opens in 1:01');
      act(() => vi.advanceTimersByTime(61_000));
      expect(screen.queryByRole('timer')).toBeNull();
      expect(screen.getByRole('link', { name: 'Retake' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a saved summary when there is no attempt to review', async () => {
    const saved = unlocked({
      pariksha: {
        q1: {
          best: 0.8,
          passed: true,
          attempts: 2,
          lastAttemptAt: new Date(Date.now() - 3_600_000),
        },
      },
    });
    await openApp(RESULT, { data: data(courseWith(), saved) });
    expect(await screen.findByText('Your best score is 80%.')).toBeTruthy();
    expect(screen.queryByText('Review')).toBeNull();
  });

  it('handles no saved attempt, a missing Pariksha and answers that were not revealed', async () => {
    const { unmount } = await openApp(RESULT, { data: data() });
    expect(await screen.findByText('Your best score is 0%.')).toBeTruthy();
    unmount();
    const hidden = {
      result: attemptResult({
        passed: false,
        score: 0,
        correctCount: 0,
        results: [{ questionId: 'k1', correct: false }],
      }),
      questions: [question('k1', { reviewItemId: undefined })],
      answers: {},
    };
    const second = await openApp({ pathname: RESULT, state: hidden }, { data: data() });
    expect(await screen.findByText('No answer')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Revisit lessons' }).getAttribute('href')).toBe(
      '/courses/git',
    );
    expect(screen.queryByRole('link', { name: /Revisit lesson:/ })).toBeNull();
    second.unmount();
    await openApp('/courses/git/pariksha/nope/result', { data: data() });
    expect(await screen.findByText('This Pariksha does not exist.')).toBeTruthy();
  });

  it('names an unknown option by its id, and an unknown course plainly', async () => {
    const odd = { ...passedState, answers: { k1: ['zzz'] } };
    const { unmount } = await openApp({ pathname: RESULT, state: odd }, { data: data() });
    expect(await screen.findByText('zzz')).toBeTruthy();
    unmount();
    await openApp('/courses/zzz/pariksha/q1/result', { data: data() });
    expect(await screen.findByText('This Pariksha does not exist.')).toBeTruthy();
  });

  it('has no axe violations', async () => {
    const { container } = await openApp({ pathname: RESULT, state: passedState }, { data: data() });
    await screen.findByRole('heading', { level: 1, name: 'Pariksha I cleared.' });
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Course complete', () => {
  const done = (over = {}) =>
    progressRow({
      completedItemIds: ['l1', 'l2', 'l3', 'l4'],
      pariksha: { q1: { best: 0.9, passed: true, attempts: 1, lastAttemptAt: null } },
      percent: 100,
      completedAt: new Date('2026-11-09T00:00:00Z'),
      certificateId: 'NSG-GIT-26-0001',
      ...over,
    });

  it('shows the stats and the certificate actions, and copies the verify link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await openApp('/courses/git/complete', { data: data(courseWith(), done()) });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Git, the NonStop Way, done.' }),
    ).toBeTruthy();
    expect(screen.getByText('9 November 2026')).toBeTruthy();
    expect(screen.getByText('90%')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'View and download certificate' }).getAttribute('href'),
    ).toBe('/certificates/NSG-GIT-26-0001');
    fireEvent.click(screen.getByRole('button', { name: 'Copy verify link' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/verify/NSG-GIT-26-0001')),
    );
    expect(await screen.findByText('Link copied')).toBeTruthy();
  });

  it('says so when the clipboard refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
      configurable: true,
    });
    await openApp('/courses/git/complete', { data: data(courseWith(), done()) });
    fireEvent.click(await screen.findByRole('button', { name: 'Copy verify link' }));
    expect(await screen.findByText('Could not copy the link.')).toBeTruthy();
  });

  it('waits for the certificate to be issued, and omits it when the course has none', async () => {
    const { unmount } = await openApp('/courses/git/complete', {
      data: data(courseWith(), done({ certificateId: null })),
    });
    expect(await screen.findByText('Preparing your certificate…')).toBeTruthy();
    unmount();
    const c = courseWith();
    c.rules.certificate = false;
    c.parvas[1]?.items.splice(1, 1);
    await openApp('/courses/git/complete', { data: data(c, done()) });
    await screen.findByText('Siddhi · Course complete');
    expect(screen.queryByText('Your certificate')).toBeNull();
    expect(screen.queryByText('Pariksha average')).toBeNull();
  });

  it('counts a Pariksha with no saved result as zero in the average', async () => {
    const saved = progressRow({
      completedItemIds: ['l1', 'l2', 'l3', 'l4'],
      percent: 100,
      completedAt: new Date('2026-11-09T00:00:00Z'),
    });
    await openApp('/courses/git/complete', { data: data(courseWith(), saved) });
    expect(await screen.findByText('0%')).toBeTruthy();
  });

  it('is not available before the course is finished', async () => {
    await openApp('/courses/git/complete', { data: data() });
    expect(await screen.findByText('Not finished yet')).toBeTruthy();
  });
});

describe('Certificates', () => {
  const certs = [certificateRow(), certificateRow({ id: 'NSG-GIT-26-0002', revoked: true })];

  it('lists mine, and says when there are none', async () => {
    const { unmount } = await openApp('/certificates', { data: fakeData({ certificates: certs }) });
    expect(await screen.findByRole('link', { name: /NSG-GIT-26-0001/ })).toBeTruthy();
    expect(screen.getByText(/Revoked/)).toBeTruthy();
    unmount();
    await openApp('/certificates', { data: fakeData() });
    expect(await screen.findByText('No certificates yet')).toBeTruthy();
  });

  it('shows one with Download, LinkedIn and copy actions', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    await openApp('/certificates/NSG-GIT-26-0001', { data: fakeData({ certificates: certs }) });
    expect(await screen.findByText('Priya Kulkarni')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(print).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Add to LinkedIn' }).getAttribute('href')).toContain(
      'linkedin.com/profile/add',
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fireEvent.click(screen.getByRole('button', { name: 'Copy verify link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    print.mockRestore();
  });

  it('says so when the verify link cannot be copied', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
      configurable: true,
    });
    await openApp('/certificates/NSG-GIT-26-0001', { data: fakeData({ certificates: certs }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Copy verify link' }));
    expect(await screen.findByText('Could not copy the link.')).toBeTruthy();
  });

  it('says when a certificate does not exist', async () => {
    await openApp('/certificates/NOPE', { data: fakeData() });
    expect(await screen.findByText('Certificate not found')).toBeTruthy();
  });

  it('has no axe violations', async () => {
    const { container } = await openApp('/certificates/NSG-GIT-26-0001', {
      data: fakeData({ certificates: certs }),
    });
    await screen.findByText('Priya Kulkarni');
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Verify (public)', () => {
  it('works signed out, is noindex, and shows a valid certificate', async () => {
    const { unmount } = await openApp('/verify/NSG-GIT-26-0001', {
      data: fakeData({ certificates: [certificateRow()] }),
      signedIn: false,
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Valid' })).toBeTruthy();
    expect(screen.getByText(/Issued 9 November 2026 to Priya Kulkarni/)).toBeTruthy();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    unmount();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('shows a revoked certificate as revoked, and an unknown id plainly', async () => {
    const { unmount } = await openApp('/verify/X', {
      data: fakeData({ certificates: [certificateRow({ id: 'X', revoked: true })] }),
      signedIn: false,
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Revoked' })).toBeTruthy();
    expect(screen.getByText('This certificate has been revoked')).toBeTruthy();
    unmount();
    await openApp('/verify/NOPE', { signedIn: false });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Certificate not found' }),
    ).toBeTruthy();
  });

  it('says when a certificate was revoked', async () => {
    await openApp('/verify/X', {
      data: fakeData({
        certificates: [
          certificateRow({ id: 'X', revoked: true, revokedAt: new Date('2026-12-02T06:00:00Z') }),
        ],
      }),
      signedIn: false,
    });
    expect(await screen.findByText('Revoked on 2 December 2026')).toBeTruthy();
  });

  it('has no axe violations', async () => {
    const { container } = await openApp('/verify/NSG-GIT-26-0001', {
      data: fakeData({ certificates: [certificateRow()] }),
      signedIn: false,
    });
    await screen.findByRole('heading', { level: 1, name: 'Valid' });
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Lesson player completion', () => {
  it('goes back to the outline from the last lesson while other items are unfinished', async () => {
    const c = courseWith();
    c.parvas = [{ id: 'p', title: 'P', items: c.parvas[0]?.items.slice(0, 2) ?? [] }];
    const d = fakeData({
      courses: [c],
      watched: progressRow({ lastItemId: 'l2', completedItemIds: [] }),
    });
    const { router } = await openApp('/courses/git/learn/l2', { data: d });
    fireEvent.click(await screen.findByRole('button', { name: 'Finish course' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git'));
  });

  it('opens the Pariksha after the last lesson of a parva and the course page when unfinished', async () => {
    const d = fakeData({
      watched: progressRow({ lastItemId: 'l3', completedItemIds: ['l1', 'l2'] }),
    });
    const { router } = await openApp('/courses/git/learn/l3', { data: d });
    fireEvent.click(await screen.findByRole('button', { name: 'Mark complete' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git/pariksha/q1'));
  });

  it('finishes into the completion screen when everything else is done', async () => {
    const d = fakeData({
      watched: progressRow({
        lastItemId: 'l4',
        completedItemIds: ['l1', 'l2', 'l3'],
        pariksha: { q1: { best: 1, passed: true, attempts: 1, lastAttemptAt: null } },
      }),
    });
    const { router } = await openApp('/courses/git/learn/l4', { data: d });
    fireEvent.click(await screen.findByRole('button', { name: 'Finish course' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/courses/git/complete'));
    expect(act).toBeDefined();
  });
});
