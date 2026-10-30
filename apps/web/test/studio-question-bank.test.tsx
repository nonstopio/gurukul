import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Course } from '@gurukul/schema';
import { log } from '../src/log';
import type { BankQuestion, StudioCourse } from '../src/studio/types';
import { axeViolations } from './axe';
import { lesson, makeCourse } from './fake-data';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const entry = (id: string, over: Partial<BankQuestion> = {}): BankQuestion => ({
  id,
  question: {
    id: `q-${id}`,
    kind: 'single',
    prompt: `Prompt ${id}?`,
    options: [
      { id: 'a', text: 'Alpha' },
      { id: 'b', text: 'Beta' },
    ],
    explanation: 'Because',
  },
  answers: ['b'],
  tags: ['git'],
  createdBy: 'u1',
  ...over,
});

type Entry = Omit<BankQuestion, 'id' | 'createdBy'>;

const quiz = (id: string, title: string, prompts: string[]) => ({
  type: 'quiz' as const,
  id,
  title,
  questionsShown: 1,
  shuffleOptions: false,
  cooldownMinutes: 0,
  revealAnswers: 'each' as const,
  blocksNext: true,
  questions: prompts.map((prompt, i) => ({
    id: `${id}-k${i}`,
    kind: 'single' as const,
    prompt,
    options: [
      { id: 'x', text: 'X' },
      { id: 'y', text: 'Y' },
    ],
    explanation: 'Why',
  })),
});

const course = (items: unknown[]): Course =>
  makeCourse({
    id: 'git',
    educatorIds: ['u1'],
    chapters: [{ id: 'p', title: 'P', items: items as never }],
  });

/** A course with a draft: "Quiz I" holds Prompt 1?, a keyed Other one and an unkeyed one. */
const withQuiz = (): StudioCourse[] => {
  const c = course([lesson('l0'), quiz('q1', 'Quiz I', ['Prompt 1?', 'Other?', 'Unkeyed?'])]);
  return [
    { live: c, draft: draftDoc(c, { answers: { q1: { 'q1-k0': ['y'], 'q1-k1': ['x'] } } }) },
    { live: makeCourse({ id: 'zz', title: 'No draft', educatorIds: ['u9'] }), draft: null },
  ];
};

async function open(
  bank: BankQuestion[],
  roles: Array<'educator' | 'admin'> = ['educator'],
  courses: StudioCourse[] = [],
) {
  const studio = fakeStudio({ bank, courses });
  const view = await openApp('/studio/bank', { roles, studio });
  return { ...view, studio };
}
const table = () => screen.findByRole('table', { name: 'Bank questions' });
const rowOf = async (prompt: string) =>
  (await within(await table()).findByRole('rowheader', { name: prompt })).closest(
    'tr',
  ) as HTMLElement;
const pick = (row: HTMLElement, item: string) => {
  fireEvent.click(within(row).getByRole('button', { name: /^Actions for/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: item }));
};

describe('question bank table', () => {
  it('lists each question with its type, topic and where it is used', async () => {
    await open(
      [
        entry('1'),
        entry('2', {
          tags: [],
          question: { ...entry('2').question, kind: 'multiple' },
        }),
      ],
      ['educator'],
      withQuiz(),
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Question bank' })).toBeTruthy();
    const first = await rowOf('Prompt 1?');
    expect(within(first).getByText('Single choice')).toBeTruthy();
    expect(within(first).getByText('git')).toBeTruthy();
    await waitFor(() =>
      expect(within(first).getByText('Git, the NonStop Way › Quiz I')).toBeTruthy(),
    );
    const second = await rowOf('Prompt 2?');
    expect(within(second).getByText('Multiple choice')).toBeTruthy();
    expect(within(second).getByText('—')).toBeTruthy();
    expect(within(second).getByText('Not used yet')).toBeTruthy();
    expect(screen.getByText('Write a question once, then add it to any Quiz.')).toBeTruthy();
  });

  it('has no accessibility violations', async () => {
    const { container } = await open([entry('1'), entry('2', { createdBy: 'u9' })]);
    await table();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('explains the bank when it is empty and still offers both actions', async () => {
    const { container } = await open([]);
    expect(
      await screen.findByRole('heading', { name: 'Write questions once, use them everywhere' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New question' })).toBeTruthy();
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Import from a Quiz' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(screen.queryByLabelText('Search by text or topic')).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows a warning when the bank cannot be read', async () => {
    const studio = fakeStudio();
    studio.data.questionBank = vi.fn().mockRejectedValue(new Error('denied'));
    await openApp('/studio/bank', { roles: ['educator'], studio });
    expect(await screen.findByText('This did not load')).toBeTruthy();
  });

  it('shows a dash for "used in" and cannot import when the courses do not load', async () => {
    const studio = fakeStudio({ bank: [entry('1')] });
    studio.data.listCourses = vi.fn().mockRejectedValue(new Error('x'));
    await openApp('/studio/bank', { roles: ['educator'], studio });
    const row = await rowOf('Prompt 1?');
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0);
    expect(
      (screen.getByRole('button', { name: 'Import from a Quiz' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('searches by text and by topic', async () => {
    await open([entry('1'), entry('2', { tags: ['sql'] })]);
    const search = await screen.findByLabelText('Search by text or topic');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    fireEvent.change(search, { target: { value: 'SQL' } });
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(await rowOf('Prompt 2?')).toBeTruthy();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByRole('heading', { name: 'Nothing matches' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect((search as HTMLInputElement).value).toBe('');
    expect(within(await table()).getAllByRole('rowheader')).toHaveLength(2);
  });
});

describe('row actions', () => {
  it('lets the creator delete their own question after confirming', async () => {
    const { studio } = await open([entry('1'), entry('2', { createdBy: 'u9' })]);
    expect(within(await rowOf('Prompt 2?')).queryByRole('button')).toBeNull();
    pick(await rowOf('Prompt 1?'), 'Delete');
    const dialog = screen.getByRole('dialog', { name: 'Delete this question from the bank?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(studio.data.removeFromBank).not.toHaveBeenCalled();
    pick(await rowOf('Prompt 1?'), 'Delete');
    vi.mocked(studio.data.questionBank).mockResolvedValue([entry('2', { createdBy: 'u9' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete question' }));
    await waitFor(() => expect(studio.data.removeFromBank).toHaveBeenCalledWith('1'));
    expect(await screen.findByText('Removed from the question bank')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Prompt 1?')).toBeNull());
  });

  it('lets an Admin act on any question', async () => {
    await open([entry('1', { createdBy: 'u9' }), entry('2', { createdBy: 'u8' })], ['admin']);
    await table();
    expect(screen.getAllByRole('button', { name: /^Actions for/ })).toHaveLength(2);
  });

  it('says so when a delete fails and keeps the list', async () => {
    const { studio } = await open([entry('1')]);
    vi.mocked(studio.data.removeFromBank).mockRejectedValueOnce(new Error('denied'));
    pick(await rowOf('Prompt 1?'), 'Delete');
    fireEvent.click(screen.getByRole('button', { name: 'Delete question' }));
    expect(await screen.findByText(/Couldn.t remove the question/)).toBeTruthy();
    expect(await rowOf('Prompt 1?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(studio.data.removeFromBank).toHaveBeenCalledTimes(2));
  });

  it('edits a question, keeping its id, and says when saving fails', async () => {
    const { studio } = await open([entry('1')]);
    pick(await rowOf('Prompt 1?'), 'Edit');
    const dialog = screen.getByRole('dialog', { name: 'Edit question' });
    expect((within(dialog).getByLabelText('Topic') as HTMLInputElement).value).toBe('git');
    fireEvent.change(within(dialog).getByLabelText('Question (Markdown)'), {
      target: { value: 'Prompt one, edited?' },
    });
    vi.mocked(studio.data.updateInBank).mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Couldn.t save the question/)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Edit question' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(studio.data.updateInBank).toHaveBeenCalledTimes(2));
    expect(studio.data.updateInBank).toHaveBeenLastCalledWith('1', {
      question: { ...entry('1').question, prompt: 'Prompt one, edited?' },
      answers: ['b'],
      tags: ['git'],
    });
    expect(await screen.findByText('Question updated')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('edits true or false and code output questions in place', async () => {
    await open([
      entry('1', {
        question: {
          ...entry('1').question,
          kind: 'trueFalse',
          options: [
            { id: 'a', text: 'True' },
            { id: 'b', text: 'False' },
          ],
        },
      }),
      entry('2', { question: { ...entry('2').question, kind: 'codeOutput' } }),
    ]);
    pick(await rowOf('Prompt 1?'), 'Edit');
    expect(screen.getByRole('button', { name: 'Remove answer 1' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByLabelText('Answer 1').hasAttribute('readonly')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    pick(await rowOf('Prompt 2?'), 'Edit');
    expect(
      (screen.getByRole('combobox', { name: 'Question type' }) as HTMLSelectElement).value,
    ).toBe('codeOutput');
  });
});

describe('new question', () => {
  it('asks for what is missing, then adds the question to the bank', async () => {
    const { studio } = await open([entry('1')]);
    fireEvent.click(await screen.findByRole('button', { name: 'New question' }));
    const dialog = screen.getByRole('dialog', { name: 'New question' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to bank' }));
    expect(within(dialog).getByText('Write the question.')).toBeTruthy();
    expect(within(dialog).getByText(/Every answer needs text/)).toBeTruthy();
    expect(within(dialog).getByText(/Explain the right answer/)).toBeTruthy();
    expect(studio.data.addToBank).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Question (Markdown)'), {
      target: { value: 'What does git add do?' },
    });
    fireEvent.change(within(dialog).getByLabelText('Answer 1'), { target: { value: 'Stages' } });
    fireEvent.change(within(dialog).getByLabelText('Answer 2'), { target: { value: 'Commits' } });
    fireEvent.click(within(dialog).getByLabelText('Answer 1 is correct'));
    fireEvent.change(within(dialog).getByLabelText('Topic'), { target: { value: 'Git, Basics' } });
    fireEvent.change(within(dialog).getByLabelText('Explanation'), {
      target: { value: 'It stages.' },
    });
    expect(await axeViolations(dialog)).toEqual([]);

    vi.mocked(studio.data.questionBank).mockResolvedValue([
      entry('1'),
      entry('new', { question: { ...entry('1').question, prompt: 'What does git add do?' } }),
    ]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to bank' }));
    await waitFor(() => expect(studio.data.addToBank).toHaveBeenCalledTimes(1));
    const [saved, uid] = vi.mocked(studio.data.addToBank).mock.calls[0] as [
      Omit<BankQuestion, 'id' | 'createdBy'>,
      string,
    ];
    expect(uid).toBe('u1');
    expect(saved.question.prompt).toBe('What does git add do?');
    expect(saved.question.kind).toBe('single');
    expect(saved.answers).toEqual([saved.question.options[0]?.id]);
    expect(saved.tags).toEqual(['git', 'basics']);
    expect(await screen.findByText('Question added to the bank')).toBeTruthy();
    expect(await rowOf('What does git add do?')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('builds a multiple choice question with more answers', async () => {
    const { studio } = await open([]);
    fireEvent.click(await screen.findByRole('button', { name: 'New question' }));
    const dialog = screen.getByRole('dialog', { name: 'New question' });
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Question type' }), {
      target: { value: 'multiple' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '+ Add answer' }));
    fireEvent.change(within(dialog).getByLabelText('Question (Markdown)'), {
      target: { value: 'Pick two' },
    });
    ['A', 'B', 'C'].forEach((text, i) =>
      fireEvent.change(within(dialog).getByLabelText(`Answer ${i + 1}`), {
        target: { value: text },
      }),
    );
    fireEvent.click(within(dialog).getByLabelText('Answer 3 is correct'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove answer 2' }));
    fireEvent.change(within(dialog).getByLabelText('Explanation'), { target: { value: 'Why' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to bank' }));
    await waitFor(() => expect(studio.data.addToBank).toHaveBeenCalled());
    const saved = vi.mocked(studio.data.addToBank).mock.calls[0]?.[0] as Entry;
    expect(saved.question.options.map((o) => o.text)).toEqual(['A', 'C']);
    expect(saved.answers).toHaveLength(2);
    expect(saved.tags).toEqual([]);
  });

  it('keeps the dialog open and says so when adding fails, and Cancel closes it', async () => {
    const { studio } = await open([]);
    vi.mocked(studio.data.addToBank).mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(await screen.findByRole('button', { name: 'New question' }));
    const dialog = screen.getByRole('dialog', { name: 'New question' });
    fireEvent.change(within(dialog).getByLabelText('Question (Markdown)'), {
      target: { value: 'Q' },
    });
    fireEvent.change(within(dialog).getByLabelText('Answer 1'), { target: { value: 'A' } });
    fireEvent.change(within(dialog).getByLabelText('Answer 2'), { target: { value: 'B' } });
    fireEvent.change(within(dialog).getByLabelText('Explanation'), { target: { value: 'E' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to bank' }));
    expect(await screen.findByText(/Couldn.t add the question/)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'New question' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('import from a Quiz', () => {
  const openImport = async (bank: BankQuestion[] = [entry('1')], courses = withQuiz()) => {
    const view = await open(bank, ['educator'], courses);
    const button = await screen.findByRole('button', { name: 'Import from a Quiz' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    return { ...view, dialog: screen.getByRole('dialog', { name: 'Import from a Quiz' }) };
  };

  it('copies the chosen questions with their answers and a topic', async () => {
    const { studio, dialog } = await openImport();
    const add = within(dialog).getByRole('button', { name: 'Add 0 to the bank' });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Quiz'), { target: { value: 'git/q1' } });
    expect(within(dialog).queryByText('Unkeyed?')).toBeNull();
    const already = within(dialog).getByRole('checkbox', { name: /Prompt 1\?/ });
    expect((already as HTMLInputElement).disabled).toBe(true);
    expect(within(dialog).getByText(/already in the bank/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Other\?/ }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Other\?/ }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Other\?/ }));
    fireEvent.change(within(dialog).getByLabelText('Topic for these questions'), {
      target: { value: 'Review' },
    });
    expect(await axeViolations(dialog)).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add 1 to the bank' }));
    await waitFor(() => expect(studio.data.addToBank).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(studio.data.addToBank).mock.calls[0]?.[0] as Entry;
    expect(saved).toMatchObject({ answers: ['x'], tags: ['review'] });
    expect(saved.question.prompt).toBe('Other?');
    expect(await screen.findByText('1 question added to the bank')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('resets the picks when another Quiz is chosen, and says when none has a marked answer', async () => {
    const c = course([quiz('q1', 'Quiz I', ['A?']), quiz('q2', 'Quiz II', ['B?', 'C?'])]);
    const { studio, dialog } = await openImport(
      [],
      [{ live: c, draft: draftDoc(c, { answers: { q2: { 'q2-k0': ['x'], 'q2-k1': ['y'] } } }) }],
    );
    fireEvent.change(within(dialog).getByLabelText('Quiz'), { target: { value: 'git/q1' } });
    expect(within(dialog).getByText(/no question with a marked answer/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Quiz'), { target: { value: 'git/q2' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /B\?/ }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /C\?/ }));
    fireEvent.change(within(dialog).getByLabelText('Quiz'), { target: { value: '' } });
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Quiz'), { target: { value: 'git/q2' } });
    expect(within(dialog).getByRole('button', { name: 'Add 0 to the bank' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /B\?/ }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /C\?/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add 2 to the bank' }));
    await waitFor(() => expect(studio.data.addToBank).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('2 questions added to the bank')).toBeTruthy();
  });

  it('explains when there is no Quiz to import from', async () => {
    const { dialog } = await openImport([], []);
    expect(within(dialog).getByRole('heading', { name: 'No Quiz to import from' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the dialog and says so when an import fails', async () => {
    const { studio, dialog } = await openImport([]);
    vi.mocked(studio.data.addToBank).mockRejectedValueOnce(new Error('denied'));
    fireEvent.change(within(dialog).getByLabelText('Quiz'), { target: { value: 'git/q1' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Prompt 1\?/ }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add 1 to the bank' }));
    });
    expect(await screen.findByText(/Couldn.t import the questions/)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Import from a Quiz' })).toBeTruthy();
  });
});
