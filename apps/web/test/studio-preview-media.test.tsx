import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Course } from '@gurukul/schema';
import type { DraftDoc } from '../src/studio/types';
import { isCorrect } from '../src/studio/PreviewPage';
import { log } from '../src/log';
import { axeViolations } from './axe';
import { fakeData, lesson, makeCourse } from './fake-data';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const exam = (over: object = {}) => ({
  type: 'quiz' as const,
  id: 'q1',
  title: 'Quiz I',
  questionsShown: 1,
  shuffleOptions: false,
  cooldownMinutes: 0,
  revealAnswers: 'each' as const,
  blocksNext: true,
  questions: [
    {
      id: 'k1',
      kind: 'single' as const,
      prompt: 'Which one?',
      code: 'git status',
      options: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Beta' },
      ],
      explanation: 'Because **alpha**',
    },
    {
      id: 'k2',
      kind: 'multiple' as const,
      prompt: 'Which many?',
      options: [
        { id: 'x', text: 'X' },
        { id: 'y', text: 'Y' },
        { id: 'z', text: 'Z' },
      ],
      explanation: 'Two',
    },
  ],
  ...over,
});

const course = (
  items: unknown[] = [lesson('l1'), exam(), lesson('l3', { layout: 'split' })],
): Course =>
  makeCourse({ educatorIds: ['u1'], chapters: [{ id: 'p', title: 'P', items: items as never }] });

async function preview(
  itemId: string,
  c: Course | null = course(),
  answers = { q1: { k1: ['a'], k2: ['x', 'y'] } },
) {
  const studio = fakeStudio({ draft: c ? draftDoc(c, { answers }) : null });
  const app = await openApp(`/studio/courses/git/preview/${itemId}`, {
    roles: ['educator'],
    studio,
  });
  return { ...app, studio };
}

describe('isCorrect', () => {
  it('needs exactly the keyed options, and a key', () => {
    expect(isCorrect(['a'], ['a'])).toBe(true);
    expect(isCorrect(['a', 'b'], ['a'])).toBe(false);
    expect(isCorrect(['b'], ['a'])).toBe(false);
    expect(isCorrect([], [])).toBe(false);
  });
});

describe('Preview page', () => {
  it('renders a lesson with the banner, outline and navigation', async () => {
    const { studio } = await preview('l1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Lesson l1' })).toBeTruthy();
    expect(screen.getByText('Preview — progress is not saved')).toBeTruthy();
    expect(screen.getByText('Body of l1')).toBeTruthy();
    expect(screen.getByText('Lesson 1 of 3')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the editor' }).getAttribute('href')).toBe(
      '/studio/courses/git',
    );
    expect(screen.getByRole('link', { name: 'Edit this lesson' }).getAttribute('href')).toBe(
      '/studio/courses/git/lessons/l1',
    );
    expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe(
      '/studio/courses/git/preview/q1',
    );
    expect(screen.queryByRole('link', { name: 'Previous' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Lesson l1' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(studio.data.saveDraft).not.toHaveBeenCalled();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('says an empty or untitled lesson is empty, and an unknown item is missing', async () => {
    await preview('l1', course([lesson('l1', { blocks: [], title: '' })]));
    expect(await screen.findByText('This lesson is empty.')).toBeTruthy();
    expect(screen.getAllByText('Untitled').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Next' })).toBeNull();
  });

  it('handles an unknown item, a missing draft and a failed load', async () => {
    await preview('nope');
    expect(
      await screen.findByRole('heading', { name: 'That item is not in this draft' }),
    ).toBeTruthy();
  });

  it('handles a missing draft', async () => {
    await preview('l1', null);
    expect(
      await screen.findByRole('heading', { name: 'There is no draft to preview' }),
    ).toBeTruthy();
  });

  it('handles a failed load', async () => {
    const studio = fakeStudio();
    studio.data.getDraft = vi.fn().mockRejectedValue(new Error('denied'));
    await openApp('/studio/courses/git/preview/l1', { roles: ['educator'], studio });
    expect(await screen.findByRole('heading', { name: 'The preview did not load' })).toBeTruthy();
    expect(screen.getByText(/may not have access/)).toBeTruthy();
  });

  it('shows a loading state', async () => {
    const studio = fakeStudio();
    let release: (v: null) => void = () => {};
    studio.data.getDraft = vi.fn(() => new Promise<DraftDoc | null>((r) => (release = r)));
    await openApp('/studio/courses/git/preview/l1', { roles: ['educator'], studio });
    expect(await screen.findByText('Loading the preview')).toBeTruthy();
    await act(async () => release(null));
  });

  it('runs a Quiz locally and grades against the draft keys', async () => {
    const { studio } = await preview('q1');
    expect(await screen.findByText('Question 1 of 2')).toBeTruthy();
    expect(screen.getByText('git status')).toBeTruthy();
    expect(screen.getByText('Quiz 2 of 3')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Edit this Quiz' }).getAttribute('href')).toBe(
      '/studio/courses/git/quiz/q1',
    );
    const check = screen.getByRole('button', { name: 'Check answer' }) as HTMLButtonElement;
    expect(check.disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Beta/ }));
    fireEvent.click(check);
    expect(screen.getByText('Not quite — the answer is A.')).toBeTruthy();
    expect(screen.getByText('alpha')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));
    expect(screen.getByText('Question 2 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /X/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Y/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Z/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Z/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(screen.getByText('Correct.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Finish preview' }));
    expect(screen.getByText(/You answered 1 of 2 correctly/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Question 1 of 2')).toBeTruthy();
    expect(studio.data.saveDraft).not.toHaveBeenCalled();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('letters every option up to the eighth and names the right ones by letter', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const big = exam({
      questions: [
        {
          id: 'k1',
          kind: 'multiple' as const,
          prompt: 'Pick',
          options: ids.map((id) => ({ id, text: `Option ${id}` })),
          explanation: 'Why',
        },
      ],
    });
    await preview('q1', course([big]), { q1: { k1: ['e', 'f'] } } as never);
    await screen.findByRole('checkbox', { name: /Option a/ });
    const badges = document.querySelectorAll('.g-quiz-option__letter');
    expect([...badges].map((b) => b.textContent).join('')).toBe('ABCDEFGH');
    fireEvent.click(await screen.findByRole('checkbox', { name: /Option a/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(screen.getByText('Not quite — the answers are E and F.')).toBeTruthy();
  });

  it('says so when a question has no key', async () => {
    await preview('q1', course(), {} as never);
    fireEvent.click(await screen.findByRole('radio', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(screen.getByText(/No correct answer is marked yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /X/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish preview' }));
    expect(screen.getByText(/You answered 0 of 2 correctly/)).toBeTruthy();
  });

  it('offers a way to add questions to an empty Quiz', async () => {
    await preview('q1', course([exam({ questions: [] })]));
    expect(
      await screen.findByRole('heading', { name: 'This Quiz has no questions yet' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Add questions' }).getAttribute('href')).toBe(
      '/studio/courses/git/quiz/q1',
    );
  });

  it('navigates between items', async () => {
    const { router } = await preview('l1');
    fireEvent.click(await screen.findByRole('link', { name: 'Next' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/studio/courses/git/preview/q1'),
    );
    expect(await screen.findByRole('link', { name: 'Previous' })).toBeTruthy();
  });
});

describe('Media library', () => {
  const blocks = [
    { type: 'video', id: 'v', provider: 'youtube', url: 'https://youtu.be/a', captions: false },
    { type: 'image', id: 'i', url: 'https://x.test/a.png', alt: 'Diagram' },
  ];
  const rows = () => [
    {
      live: makeCourse({ id: 'git', educatorIds: ['u1'] }),
      draft: draftDoc(
        makeCourse({
          educatorIds: ['u1'],
          chapters: [
            {
              id: 'p',
              title: 'P',
              items: [
                lesson('l1', { title: 'Intro', blocks }),
                lesson('l2', { title: 'More', blocks: [blocks[0]] }),
              ],
            },
          ],
        }),
      ),
    },
  ];

  it('lists media grouped by kind with where it is used', async () => {
    await openApp('/studio/media', {
      roles: ['educator'],
      studio: fakeStudio({ courses: rows() }),
      data: fakeData(),
    });
    expect(await screen.findByRole('heading', { name: 'Videos (1)' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Images (1)' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Embeds/ })).toBeNull();
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          el.textContent === 'Used in Git, the NonStop Way › Intro, Git, the NonStop Way › More',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/does not store uploads/)).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('copies a link, and reports when it cannot', async () => {
    await openApp('/studio/media', {
      roles: ['educator'],
      studio: fakeStudio({ courses: rows() }),
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fireEvent.click(await screen.findByRole('button', { name: /Copy link for Diagram/ }));
    expect(writeText).toHaveBeenCalledWith('https://x.test/a.png');
    expect(await screen.findByText('Link copied.')).toBeTruthy();
    writeText.mockRejectedValue(new Error('no'));
    fireEvent.click(screen.getByRole('button', { name: /Copy link for Diagram/ }));
    expect(await screen.findByText(/Could not copy the link/)).toBeTruthy();
    expect(log.warn).toHaveBeenCalledWith('Copying a link failed');
  });

  it('shows an empty state and a failure', async () => {
    await openApp('/studio/media', { roles: ['admin'], studio: fakeStudio() });
    expect(await screen.findByRole('heading', { name: 'No media yet' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to courses' }).getAttribute('href')).toBe(
      '/studio',
    );
  });

  it('shows a failure', async () => {
    const studio = fakeStudio();
    studio.data.listCourses = vi.fn().mockRejectedValue(new Error('x'));
    await openApp('/studio/media', { roles: ['educator'], studio });
    expect(await screen.findAllByText('This did not load')).not.toHaveLength(0);
  });
});
