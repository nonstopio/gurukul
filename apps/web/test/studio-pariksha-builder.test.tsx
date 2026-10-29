import type { Course, Pariksha, Question } from '@gurukul/schema';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BankQuestion, Working } from '../src/studio/types';
import { axeViolations } from './axe';
import { fakeConsole } from './fake-console';
import { makeCourse } from './fake-data';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';

const question = (id: string, over: Partial<Question> = {}): Question => ({
  id,
  kind: 'single',
  prompt: `Question ${id}?`,
  options: [
    { id: `${id}a`, text: 'Alpha' },
    { id: `${id}b`, text: 'Beta' },
    { id: `${id}c`, text: 'Gamma' },
  ],
  explanation: `Because ${id}.`,
  reviewItemId: 'l1',
  ...over,
});
const answers = () => ({ q1: { k1: ['k1a'], k2: ['k2b'], k3: ['k3c'] } });
function courseWith(questions = [question('k1'), question('k2'), question('k3')]): Course {
  const course = makeCourse();
  const p = course.parvas[1]?.items[1];
  if (p?.type === 'pariksha') Object.assign(p, { questions, questionsShown: 2 });
  return course;
}
const PATH = '/studio/courses/git/pariksha/q1';
async function open(
  opts: {
    course?: Course;
    answers?: Working['answers'];
    path?: string;
    bank?: BankQuestion[];
    console?: ReturnType<typeof fakeConsole>;
    studio?: ReturnType<typeof fakeStudio>;
  } = {},
) {
  const studio =
    opts.studio ??
    fakeStudio({
      draft: draftDoc(opts.course ?? courseWith(), { rev: 2, answers: opts.answers ?? answers() }),
      bank: opts.bank ?? [],
    });
  const view = await openApp(opts.path ?? PATH, {
    roles: ['acharya'],
    studio,
    ...(opts.console ? { console: opts.console } : {}),
  });
  await screen.findByRole('heading', { name: /\d questions?/ }).catch(() => undefined);
  return { ...view, studio };
}
const saved = (studio: ReturnType<typeof fakeStudio>) => {
  const work = vi.mocked(studio.data.saveDraft).mock.lastCall?.[1] as Working;
  const p = work.course.parvas.flatMap((x) => x.items).find((i) => i.id === 'q1') as Pariksha;
  return { work, p, keys: work.answers.q1 };
};
const saveNow = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
  });
};
const change = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const pick = (id: string) =>
  screen.getByRole('button', { name: new RegExp(`^\\d Question ${id}\\?$`) });
const rows = () => within(screen.getByRole('list', { name: 'Questions' })).getAllByRole('listitem');
const bankQuestion = (over: Partial<BankQuestion> = {}): BankQuestion => ({
  id: 'bank-1',
  question: question('bq', { reviewItemId: 'l3' }),
  answers: ['bqb'],
  tags: ['git', 'basics'],
  createdBy: 'u9',
  ...over,
});

describe('Pariksha builder: layout', () => {
  it('lists the questions with the first one open, and shows the settings', async () => {
    await open();
    expect(screen.getByRole('heading', { name: '3 questions' })).toBeTruthy();
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining('Question k1?'),
      expect.stringContaining('Question k2?'),
      expect.stringContaining('Question k3?'),
    ]);
    const current = pick('k1');
    expect(current.getAttribute('aria-current')).toBe('true');
    expect((screen.getByLabelText('Question (Markdown)') as HTMLTextAreaElement).value).toBe(
      'Question k1?',
    );
    expect((screen.getByLabelText('Answer 1 is correct') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Answer 2 is correct') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Questions shown') as HTMLInputElement).value).toBe('2');
    expect((screen.getByLabelText('Pass mark (%)') as HTMLInputElement).placeholder).toBe('70');
    expect(screen.getByText(/graded on the server and stored apart/)).toBeTruthy();
  });

  it('has no accessibility violations', async () => {
    const { container } = await open();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('says "1 question" for a single question', async () => {
    await open({ course: courseWith([question('k1')]), answers: { q1: { k1: ['k1a'] } } });
    expect(screen.getByRole('heading', { name: '1 question' })).toBeTruthy();
  });

  it('opens the question you pick', async () => {
    await open();
    fireEvent.click(pick('k2'));
    expect((screen.getByLabelText('Question (Markdown)') as HTMLTextAreaElement).value).toBe(
      'Question k2?',
    );
    expect((screen.getByLabelText('Answer 2 is correct') as HTMLInputElement).checked).toBe(true);
    expect(pick('k2').getAttribute('aria-current')).toBe('true');
  });

  it('opens the question named in the link from course analytics', async () => {
    await open({ path: `${PATH}?question=k3` });
    expect(pick('k3').getAttribute('aria-current')).toBe('true');
  });

  it('opens the learner preview after saving', async () => {
    const { router, studio } = await open();
    change('Explanation', 'Edited');
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'Try it as a learner' }));
    });
    expect(saved(studio).p.questions[0]?.explanation).toBe('Edited');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/studio/courses/git/preview/q1'),
    );
  });
});

describe('Pariksha builder: states', () => {
  it('says so when the Pariksha does not exist', async () => {
    await open({ path: '/studio/courses/git/pariksha/nope' });
    expect(
      await screen.findByRole('heading', { name: 'This Pariksha does not exist' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the course' })).toBeTruthy();
  });

  it('says so when there is no draft', async () => {
    await open({ studio: fakeStudio({ draft: null }) });
    expect(await screen.findByRole('heading', { name: /no draft you can edit/ })).toBeTruthy();
  });

  it('offers to add the first question when there are none', async () => {
    const course = courseWith([]);
    const { studio } = await open({ course, answers: {} });
    expect(await screen.findByRole('heading', { name: 'No questions yet' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add the first question' }));
    expect(screen.getByRole('heading', { name: '1 question' })).toBeTruthy();
    expect((screen.getByLabelText('Question (Markdown)') as HTMLTextAreaElement).value).toBe(
      'New question',
    );
    await saveNow();
    const { p, keys } = saved(studio);
    expect(p.questions).toHaveLength(1);
    expect(keys?.[p.questions[0]?.id as string]).toEqual([p.questions[0]?.options[0]?.id]);
  });
});

describe('Pariksha builder: editing a question', () => {
  it('edits the prompt, code, explanation and revisit link', async () => {
    const { studio } = await open();
    change('Question (Markdown)', 'What is HEAD?');
    change('Code (optional)', 'git log');
    change('Explanation', 'It points at the tip.');
    change('Revisit link', 'l3');
    await saveNow();
    expect(saved(studio).p.questions[0]).toMatchObject({
      prompt: 'What is HEAD?',
      code: 'git log',
      explanation: 'It points at the tip.',
      reviewItemId: 'l3',
    });
    change('Code (optional)', '');
    change('Revisit link', '');
    await saveNow();
    const first = saved(studio).p.questions[0] as Question;
    expect('code' in first).toBe(false);
    expect('reviewItemId' in first).toBe(false);
  });

  it('lists the course lessons as revisit links', async () => {
    await open();
    const select = screen.getByLabelText('Revisit link');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['No link', 'Lesson l1', 'Lesson l2', 'Lesson l3', 'Lesson l4']);
  });

  it('marks one correct answer for single choice', async () => {
    const { studio } = await open();
    fireEvent.click(screen.getByLabelText('Answer 3 is correct'));
    await saveNow();
    expect(saved(studio).keys?.k1).toEqual(['k1c']);
    expect((screen.getByLabelText('Answer 1 is correct') as HTMLInputElement).checked).toBe(false);
  });

  it('shows checkboxes for multiple choice and keeps at least one marked', async () => {
    const { studio } = await open();
    change('Question type', 'multiple');
    const first = screen.getByLabelText('Answer 1 is correct') as HTMLInputElement;
    expect(first.type).toBe('checkbox');
    fireEvent.click(screen.getByLabelText('Answer 2 is correct'));
    fireEvent.click(first);
    await saveNow();
    expect(saved(studio).keys?.k1).toEqual(['k1b']);
    fireEvent.click(screen.getByLabelText('Answer 2 is correct'));
    await saveNow();
    expect(saved(studio).keys?.k1).toEqual(['k1b']);
  });

  it('reduces several correct answers to one when leaving multiple choice', async () => {
    const { studio } = await open({ answers: { q1: { k1: ['k1a', 'k1c'], k2: [], k3: [] } } });
    change('Question type', 'multiple');
    change('Question type', 'single');
    await saveNow();
    expect(saved(studio).keys?.k1).toEqual(['k1a']);
  });

  it('locks true or false to two answers that cannot be edited or removed', async () => {
    const { studio } = await open();
    change('Question type', 'trueFalse');
    expect((screen.getByLabelText('Answer 1') as HTMLInputElement).value).toBe('True');
    expect((screen.getByLabelText('Answer 2') as HTMLInputElement).value).toBe('False');
    expect(screen.queryByLabelText('Answer 3')).toBeNull();
    expect((screen.getByLabelText('Answer 1') as HTMLInputElement).readOnly).toBe(true);
    expect(
      (screen.getByRole('button', { name: '+ Add answer' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Remove answer 1' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await saveNow();
    expect(saved(studio).keys?.k1).toEqual(['k1a']);
  });

  it('asks for the code in a code-output question', async () => {
    await open();
    change('Question type', 'codeOutput');
    expect(screen.getByLabelText('Code to read')).toBeTruthy();
  });

  it('edits answer text', async () => {
    const { studio } = await open();
    change('Answer 2', 'Bravo');
    await saveNow();
    expect(saved(studio).p.questions[0]?.options[1]?.text).toBe('Bravo');
  });

  it('adds answers up to six and removes them down to two, keeping the key in step', async () => {
    const { studio } = await open();
    const add = screen.getByRole('button', { name: '+ Add answer' }) as HTMLButtonElement;
    for (let i = 0; i < 3; i++) fireEvent.click(add);
    expect(screen.getByLabelText('Answer 6')).toBeTruthy();
    expect(add.disabled).toBe(true);
    for (let i = 0; i < 4; i++)
      fireEvent.click(screen.getByRole('button', { name: 'Remove answer 1' }));
    expect(
      (screen.getByRole('button', { name: 'Remove answer 1' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await saveNow();
    const { p, keys } = saved(studio);
    expect(p.questions[0]?.options).toHaveLength(2);
    expect(keys?.k1).toEqual([p.questions[0]?.options[0]?.id]);
    expect(p.questions[0]?.options.map((o) => o.id)).not.toContain('k1a');
  });

  it('shows what is wrong with a question, next to the field', async () => {
    await open({
      course: courseWith([question('k1', { explanation: '' })]),
      answers: { q1: { k1: [] } },
    });
    expect(screen.getByText('A question needs an explanation.')).toBeTruthy();
    expect(screen.getByLabelText('Explanation').getAttribute('aria-invalid')).toBe('true');
    const answerBox = () => within(screen.getByRole('group', { name: /^Answers/ }));
    expect(answerBox().getByRole('alert').textContent).toBe('Mark the correct answer.');
    fireEvent.click(screen.getByLabelText('Answer 1 is correct'));
    expect(answerBox().queryByRole('alert')).toBeNull();
    change('Question (Markdown)', '   ');
    expect(screen.getByText('A question has no text.')).toBeTruthy();
    change('Answer 1', '');
    expect(answerBox().getByRole('alert').textContent).toBe('An answer is empty.');
  });
});

describe('Pariksha builder: a draft without answer keys', () => {
  it('shows nothing marked correct and asks for it', async () => {
    await open({ answers: {} });
    expect((screen.getByLabelText('Answer 1 is correct') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Mark the correct answer.')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Answer 2 is correct'));
    expect(screen.queryByText('Mark the correct answer.')).toBeNull();
  });

  it('keeps the other questions marked when only some have keys', async () => {
    const { studio } = await open({ answers: { q1: { k2: ['k2b'] } } });
    fireEvent.click(screen.getByLabelText('Answer 3 is correct'));
    await saveNow();
    expect(saved(studio).keys).toEqual({ k2: ['k2b'], k1: ['k1c'] });
  });
});

describe('Pariksha builder: the question list', () => {
  it('adds a question and opens it', async () => {
    const { studio } = await open();
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }));
    expect(screen.getByRole('heading', { name: '4 questions' })).toBeTruthy();
    expect((screen.getByLabelText('Question (Markdown)') as HTMLTextAreaElement).value).toBe(
      'New question',
    );
    await saveNow();
    expect(saved(studio).p.questions).toHaveLength(4);
  });

  it('deletes a question after confirming, with its answer key', async () => {
    const { studio } = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Delete this question' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this question?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: '3 questions' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete this question' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete question' }));
    expect(screen.getByRole('heading', { name: '2 questions' })).toBeTruthy();
    expect((screen.getByLabelText('Question (Markdown)') as HTMLTextAreaElement).value).toBe(
      'Question k2?',
    );
    await saveNow();
    const { p, keys } = saved(studio);
    expect(p.questions.map((q) => q.id)).toEqual(['k2', 'k3']);
    expect(keys).toEqual({ k2: ['k2b'], k3: ['k3c'] });
    expect(p.questionsShown).toBe(2);
  });

  it('reorders with the keyboard and keeps each answer key with its question', async () => {
    const { studio } = await open();
    const grip = screen.getByRole('button', { name: /^Move question: Question k1/ });
    fireEvent.keyDown(grip, { key: 'ArrowDown', altKey: true });
    expect(rows()[1]?.textContent).toContain('Question k1?');
    await saveNow();
    const { p, keys } = saved(studio);
    expect(p.questions.map((q) => q.id)).toEqual(['k2', 'k1', 'k3']);
    expect(keys?.k1).toEqual(['k1a']);
  });

  it('marks questions learners often get wrong on the first try', async () => {
    const stats = fakeConsole({
      course: { questionFirstTry: { k2: { correct: 1, total: 4 }, k3: { correct: 1, total: 2 } } },
    });
    await open({ console: stats });
    expect(await screen.findByText('Low first-try score')).toBeTruthy();
    expect(screen.getAllByText('Low first-try score')).toHaveLength(1);
    expect(within(rows()[1] as HTMLElement).getByText('Low first-try score')).toBeTruthy();
    expect(screen.queryByText('Learners find this hard')).toBeNull();
    fireEvent.click(pick('k2'));
    expect(screen.getByText('Learners find this hard')).toBeTruthy();
    expect(screen.getByText(/25% of learners got this right first time \(4 tries\)/)).toBeTruthy();
  });

  it('shows the first-try percentage beside each question that has tries', async () => {
    const stats = fakeConsole({
      course: { questionFirstTry: { k1: { correct: 3, total: 4 }, k2: { correct: 1, total: 4 } } },
    });
    await open({ console: stats });
    expect(await screen.findByText('75% first try')).toBeTruthy();
    expect(within(rows()[1] as HTMLElement).getByText('25% first try')).toBeTruthy();
    expect(within(rows()[2] as HTMLElement).queryByText(/first try$/)).toBeNull();
  });

  it('works without first-try numbers when they cannot be read', async () => {
    const stats = fakeConsole();
    stats.data.courseStats = vi.fn().mockRejectedValue(new Error('denied'));
    await open({ console: stats });
    expect(screen.queryByText('Low first-try score')).toBeNull();
    expect(screen.getByLabelText('Question (Markdown)')).toBeTruthy();
  });
});

describe('Pariksha builder: settings', () => {
  it('changes the title, pass mark, questions shown, cooldown, toggles and reveal rule', async () => {
    const { studio } = await open();
    change('Pariksha title', 'Final check');
    change('Pass mark (%)', '80');
    change('Questions shown', '3');
    change('Cooldown between attempts (minutes)', '30');
    fireEvent.click(screen.getByRole('switch', { name: 'Shuffle answer order' }));
    fireEvent.click(
      screen.getByRole('switch', { name: 'Learners must pass to open the next parva' }),
    );
    change('Reveal answers', 'never');
    await saveNow();
    expect(saved(studio).p).toMatchObject({
      title: 'Final check',
      passMark: 0.8,
      questionsShown: 3,
      cooldownMinutes: 30,
      shuffleOptions: true,
      blocksNext: false,
      revealAnswers: 'never',
    });
  });

  it('uses the course pass mark when the field is emptied', async () => {
    const { studio } = await open();
    change('Pass mark (%)', '80');
    change('Pass mark (%)', '');
    await saveNow();
    expect('passMark' in saved(studio).p).toBe(false);
  });

  it('never lets questions shown go above the number of questions', async () => {
    const { studio } = await open();
    change('Questions shown', '9');
    await saveNow();
    expect(saved(studio).p.questionsShown).toBe(3);
  });
});

describe('Pariksha builder: question bank', () => {
  it('saves the question and its key to the bank, with tags, without the revisit link', async () => {
    const { studio } = await open();
    change('Tags for the question bank', 'Git, basics, git');
    fireEvent.click(screen.getByRole('button', { name: 'Save to question bank' }));
    await waitFor(() => expect(studio.data.addToBank).toHaveBeenCalledTimes(1));
    const [entry, uid] = vi.mocked(studio.data.addToBank).mock.calls[0] as [BankQuestion, string];
    expect(uid).toBe('u1');
    expect(entry.answers).toEqual(['k1a']);
    expect(entry.tags).toEqual(['git', 'basics']);
    expect(entry.question.prompt).toBe('Question k1?');
    expect('reviewItemId' in entry.question).toBe(false);
    expect(await screen.findByText('Saved to the question bank')).toBeTruthy();
  });

  it('tells you when saving to the bank fails', async () => {
    const { studio } = await open();
    vi.mocked(studio.data.addToBank).mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Save to question bank' }));
    expect(await screen.findByText(/Couldn.t save the question to the bank/)).toBeTruthy();
  });

  it('imports a bank question with new ids and its answer key', async () => {
    const { studio } = await open({
      bank: [
        bankQuestion(),
        bankQuestion({ id: 'bank-2', question: question('zz', { prompt: 'Rebase?' }), tags: [] }),
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import from question bank' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import from question bank' });
    expect(await within(dialog).findAllByRole('listitem')).toHaveLength(2);
    expect(within(dialog).getByText('basics')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Search the bank'), {
      target: { value: 'basics' },
    });
    const items = within(dialog).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    fireEvent.click(
      within(items[0] as HTMLElement).getByRole('button', { name: 'Add to this Pariksha' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { name: '4 questions' })).toBeTruthy();
    expect(await screen.findByText('Added from the question bank')).toBeTruthy();
    await saveNow();
    const { p, keys } = saved(studio);
    const added = p.questions[3] as Question;
    expect(added.prompt).toBe('Question bq?');
    expect(added.id).not.toBe('bq');
    expect(added.options.map((o) => o.id)).not.toContain('bqa');
    expect(keys?.[added.id]).toEqual([added.options[1]?.id]);
    expect('reviewItemId' in added).toBe(false);
  });

  it('shows an empty bank and a search with no match', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Import from question bank' }));
    expect(await screen.findByRole('heading', { name: 'The bank is empty' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says so when nothing in the bank matches', async () => {
    await open({ bank: [bankQuestion()] });
    fireEvent.click(screen.getByRole('button', { name: 'Import from question bank' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findAllByRole('listitem');
    fireEvent.change(within(dialog).getByLabelText('Search the bank'), {
      target: { value: 'zzz' },
    });
    expect(within(dialog).getByRole('heading', { name: 'Nothing matches' })).toBeTruthy();
  });

  it('has no accessibility violations in the import dialog', async () => {
    await open({ bank: [bankQuestion()] });
    fireEvent.click(screen.getByRole('button', { name: 'Import from question bank' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findAllByRole('listitem');
    expect(await axeViolations(dialog)).toEqual([]);
  });
});
