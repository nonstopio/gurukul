import { render, screen, within } from '@testing-library/react';
import type { Block, Course, Lesson, Quiz, SessionTodo } from '@gurukul/schema';
import { courseChanges } from '@gurukul/schema/changes';
import type { ChangeRow } from '@gurukul/schema/changes';
import { ToastProvider } from '@gurukul/ui';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StudioProvider } from '../src/studio/StudioProvider';
import { ReviewChecks } from '../src/studio/session/ReviewChecks';
import { RowDiff, hasProse } from '../src/studio/session/ReviewDiff';
import type { Layout } from '../src/studio/session/ReviewDiff';
import { numbersOf } from '../src/studio/session/review';
import type { Working } from '../src/studio/types';
import { axeViolations } from './axe';
import { lesson, makeCourse } from './fake-data';
import { fakeStudio } from './fake-studio';

const base = (): Working => ({ course: makeCourse(), answers: { q1: { k1: ['a'] } } });

function change(w: Working, edit: (c: Course, answers: Working['answers']) => void): Working {
  const next = structuredClone(w);
  edit(next.course, next.answers);
  return next;
}

const chapterOf = (course: Course, id: string) =>
  course.chapters.find((c) => c.id === id) as Course['chapters'][number];

function draw(before: Working | null, after: Working, key: string, layout: Layout = 'split') {
  const row = courseChanges(before, after).rows.find((r) => r.key === key) as ChangeRow;
  const view = render(
    <RowDiff row={row} before={before} after={after} layout={layout} mode="source" name="Row" />,
  );
  return { row, view };
}

const group = (name: string) => screen.getByRole('group', { name });

describe('comparing media and checks', () => {
  const MEDIA: Block[] = [
    { type: 'video', id: 'v', provider: 'youtube', url: 'https://youtu.be/a', captions: true },
    { type: 'embed', id: 'e', url: 'https://codepen.io/a', title: 'Pen' },
    { type: 'file', id: 'f', url: 'https://example.com/a.pdf', label: '' },
    { type: 'image', id: 'i', url: 'https://example.com/a.png', alt: '', caption: 'Diagram' },
    {
      type: 'check',
      id: 'k',
      prompt: 'Ready?',
      options: ['Yes', 'No', 'Maybe'],
      correct: 0,
      explanation: '',
    },
    {
      type: 'check',
      id: 'k2',
      prompt: 'Sure?',
      options: ['Yes', 'No'],
      correct: 0,
      explanation: '',
    },
    { type: 'markdown', id: 'm', md: 'Stays put.' },
    { type: 'code', id: 'c', lang: 'bash', code: 'ls', copy: false, terminal: true },
  ];
  const was = change(base(), (c) => {
    (chapterOf(c, 'p1').items[0] as Lesson).blocks = MEDIA;
  });
  const now = change(was, (c) => {
    const l1 = chapterOf(c, 'p1').items[0] as Lesson;
    l1.blocks = [
      { type: 'code', id: 'c', lang: 'bash', code: 'ls', copy: false, terminal: true },
      {
        type: 'video',
        id: 'v',
        provider: 'youtube',
        url: 'https://youtu.be/b',
        captions: true,
        title: 'Intro',
      },
      { type: 'embed', id: 'e', url: 'https://codepen.io/b', title: '' },
      { type: 'file', id: 'f', url: 'https://example.com/b.pdf', label: 'Slides' },
      { type: 'image', id: 'i', url: 'https://example.com/b.png', alt: '', caption: '' },
      {
        type: 'check',
        id: 'k',
        prompt: 'Ready?',
        options: ['Yes', 'Perhaps'],
        correct: 1,
        explanation: '',
      },
      // Only its answer changed.
      {
        type: 'check',
        id: 'k2',
        prompt: 'Sure?',
        options: ['Yes', 'No'],
        correct: 1,
        explanation: '',
      },
      { type: 'markdown', id: 'm', md: 'Stays put.' },
    ];
  });

  it('shows media as link cards and thumbnails, with the fields that changed', async () => {
    draw(was, now, 'lesson:l1');
    const video = group('changed: Video block 2');
    expect(
      within(video).getByRole('link', { name: 'Video · youtu.be (opens in a new window)' }),
    ).toBeTruthy();
    expect(
      within(video).getByRole('link', { name: 'Intro · youtu.be (opens in a new window)' }),
    ).toBeTruthy();
    expect(
      within(group('changed: Embed block 3')).getByRole('link', {
        name: 'Embed · codepen.io (opens in a new window)',
      }),
    ).toBeTruthy();
    expect(
      within(group('changed: File block 4')).getByRole('link', {
        name: 'File · example.com (opens in a new window)',
      }),
    ).toBeTruthy();
    expect(
      within(group('changed: File block 4')).getByRole('link', {
        name: 'Slides · example.com (opens in a new window)',
      }),
    ).toBeTruthy();
    const image = group('changed: Image block 5');
    expect(within(image).getAllByText('Diagram').length).toBeGreaterThan(0);
    expect(within(image).getByText('Image')).toBeTruthy();
    // Moved blocks, drawn once as they are.
    expect(group('moved: Code block 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: '1 unchanged block' })).toBeTruthy();
    expect(await axeViolations(document.body.firstElementChild as Element)).toEqual([]);
  });

  it('marks added, removed and reworded options of a check, and an answer changed alone', () => {
    draw(was, now, 'lesson:l1', 'inline');
    const check = group('changed: Check block 6');
    expect(within(check).getByText('Correct answer changed: A → B')).toBeTruthy();
    const merged = check.querySelector('.g-diff-row__merged') as HTMLElement;
    expect(merged.querySelectorAll('del').length).toBeGreaterThan(0);
    expect(merged.querySelectorAll('ins').length).toBeGreaterThan(0);
    const alone = group('changed: Check block 7');
    expect(within(alone).getByText('Correct answer changed: A → B')).toBeTruthy();
    expect(within(alone).getByText('Sure?')).toBeTruthy();
    // Inline, media shows before above after.
    expect(
      [...group('changed: Video block 2').querySelectorAll('.g-diff-row__side')].map(
        (p) => p.textContent,
      ),
    ).toEqual(['Before', 'After']);
  });

  it('knows which rows hold prose for the Rendered switch', () => {
    const { row } = draw(was, now, 'lesson:l1');
    expect(hasProse(row)).toBe(false);
    const prose = change(was, (c) => {
      (
        (chapterOf(c, 'p1').items[0] as Lesson).blocks[6] as Extract<Block, { type: 'markdown' }>
      ).md = 'Moved on.';
    });
    expect(
      hasProse(courseChanges(was, prose).rows.find((r) => r.key === 'lesson:l1') as ChangeRow),
    ).toBe(true);
    expect(hasProse(courseChanges(was, prose).rows[0] as ChangeRow)).toBe(true);
    const course = change(was, (c) => (c.title = 'X'));
    expect(hasProse(courseChanges(was, course).rows[0] as ChangeRow)).toBe(false);
  });
});

describe('comparing a moved lesson and a Quiz', () => {
  it('says where a lesson moved from and to', () => {
    const b = change(base(), (c) => (chapterOf(c, 'p1').title = '  '));
    const work = change(b, (c) => {
      const [moved] = chapterOf(c, 'p1').items.splice(0, 1);
      chapterOf(c, 'p2').items.push(moved as Lesson);
    });
    draw(b, work, 'lesson:l1');
    expect(
      screen.getByText('Moved from Untitled, position 1 to History, position 4.'),
    ).toBeTruthy();
  });

  it('compares questions added, removed, moved and unchanged, keys shown on each side', async () => {
    const two = (w: Working) =>
      change(w, (c, answers) => {
        const quiz = chapterOf(c, 'p2').items[1] as Quiz;
        quiz.questions.push(
          {
            id: 'k2',
            kind: 'single',
            prompt: 'Second?',
            options: [
              { id: 'a', text: 'A' },
              { id: 'b', text: 'B' },
            ],
            explanation: '',
          },
          {
            id: 'k3',
            kind: 'single',
            prompt: 'Third?',
            options: [
              { id: 'a', text: 'A' },
              { id: 'b', text: 'B' },
            ],
            explanation: 'So.',
          },
        );
        answers.q1 = { k1: ['a'], k2: ['a'], k3: ['b'] };
      });
    const b = two(base());
    const work = change(b, (c, answers) => {
      const quiz = chapterOf(c, 'p2').items[1] as Quiz;
      const [k1, , k3] = quiz.questions;
      quiz.questions = [
        k3 as Quiz['questions'][number],
        {
          id: 'k4',
          kind: 'codeOutput',
          prompt: 'Output?',
          code: 'echo 1',
          options: [
            { id: 'a', text: '1' },
            { id: 'b', text: '2' },
          ],
          explanation: 'It prints 1.',
        },
        {
          ...(k1 as Quiz['questions'][number]),
          options: [
            { id: 'b', text: 'B' },
            { id: 'c', text: 'C' },
          ],
        },
      ];
      // Moved quiz into chapter 1.
      const [moved] = chapterOf(c, 'p2').items.splice(1, 1);
      chapterOf(c, 'p1').items.push(moved as Quiz);
      answers.q1 = { k1: ['c'], k3: ['b'], k4: ['a'] };
    });
    draw(b, work, 'quiz:q1');
    expect(screen.getByText('Moved from History, position 2 to Basics, position 3.')).toBeTruthy();
    const added = group('added: Question 2');
    expect(within(added).getByText('Output?')).toBeTruthy();
    expect(within(added).getByLabelText('Question 2, after: Code')).toBeTruthy();
    expect(within(added).getByText('It prints 1.')).toBeTruthy();
    expect(within(added).getByText('(correct)', { exact: false })).toBeTruthy();
    const removed = group('removed: Question 2');
    expect(within(removed).getByText('Second?')).toBeTruthy();
    const changed = group('changed and moved: Question 3');
    expect(within(changed).getByText('Correct answer changed: A → B')).toBeTruthy();
    // Before keeps the base's order of options; the one removed is struck.
    const before = changed.querySelector('.g-diff-row__cell--before') as HTMLElement;
    expect(before.textContent).toContain('A. removed: A (correct)B. B');
    expect(screen.getByRole('button', { name: '1 unchanged question' })).toBeTruthy();
    expect(await axeViolations(document.body.firstElementChild as Element)).toEqual([]);
  });

  it('folds unchanged questions, and opens them with their keys', () => {
    const b = base();
    const work = change(b, (c) => ((chapterOf(c, 'p2').items[1] as Quiz).questionsShown = 1));
    const quiz = change(b, (c) => ((chapterOf(c, 'p2').items[1] as Quiz).title = 'Renamed'));
    draw(b, quiz, 'quiz:q1');
    fireEvent.click(screen.getByRole('button', { name: '1 unchanged question' }));
    expect(screen.getAllByText('(correct)', { exact: false })).toHaveLength(1);
    void work;
  });
});

describe('comparing an added Quiz and a reworded question', () => {
  it('shows a new Quiz with no keys yet, and a question whose prompt alone changed', async () => {
    const b = base();
    const added = change(b, (c) => {
      chapterOf(c, 'p1').items.push({ ...(chapterOf(c, 'p2').items[1] as Quiz), id: 'q9' });
    });
    draw(b, added, 'quiz:q9');
    expect(
      within(group('added: Question 1')).queryByText('(correct)', { exact: false }),
    ).toBeNull();
    const reworded = change(b, (c) => {
      ((chapterOf(c, 'p2').items[1] as Quiz).questions[0] as Quiz['questions'][number]).prompt =
        'Which one?';
    });
    draw(b, reworded, 'quiz:q1', 'inline');
    const question = group('changed: Question 1');
    expect(within(question).queryByText(/^Correct answer changed/)).toBeNull();
    expect(within(question).getByText('Question')).toBeTruthy();
    expect(await axeViolations(document.body.firstElementChild as Element)).toEqual([]);
  });
});

describe('comparing the landing page and chapters', () => {
  it('lists outcomes added, removed and reworded', () => {
    const b = base();
    const work = change(b, (c) => {
      c.outcomes = ['Commit with full confidence', 'Rebase'];
    });
    draw(b, work, 'landing:landing');
    const outcomes = group('changed: Outcomes');
    expect(outcomes.querySelector('.g-diff-row__cell--after')?.textContent).toContain(
      'added: Rebase',
    );
    expect(screen.queryByText('Description')).toBeNull();
  });

  it('says a chapter moved, was added or was removed', () => {
    const b = base();
    const moved = change(b, (c) => c.chapters.reverse());
    draw(b, moved, 'chapter:p1');
    expect(screen.getByText('Moved from position 1 to 2.')).toBeTruthy();
    const added = change(b, (c) =>
      c.chapters.push({ id: 'p3', title: 'New', items: [lesson('n') as Lesson] }),
    );
    draw(b, added, 'chapter:p3');
    expect(screen.getByText('Added: its lessons and quizzes are listed under it.')).toBeTruthy();
    const removed = change(b, (c) => c.chapters.pop());
    draw(b, removed, 'chapter:p2');
    expect(screen.getByText('Removed, with the lessons and quizzes still in it.')).toBeTruthy();
  });

  it('draws course details inline as well', () => {
    const b = base();
    const work = change(b, (c) => {
      c.rules.passMark = 0.8;
      c.level = 'advanced';
    });
    draw(b, work, 'course:course', 'inline');
    expect(screen.getByText('Pass mark').nextElementSibling?.textContent).toBe(
      '70%→ changed to 80%',
    );
    expect(screen.getByText('Level').nextElementSibling?.textContent).toBe(
      'Foundation→ changed to Advanced',
    );
  });
});

describe('the checks, drawn on their own', () => {
  const todo: SessionTodo[] = [];
  function checks(work: Working, b: Working, open = true) {
    const studio = fakeStudio();
    const onAsk = vi.fn();
    render(
      <ToastProvider>
        <StudioProvider {...studio}>
          <ReviewChecks
            work={work}
            changes={courseChanges(b, work)}
            todos={todo}
            numbers={numbersOf(work.course)}
            words={{ lesson: 'Lesson', quiz: 'Quiz', chapter: 'Chapter' }}
            open={open}
            onShow={vi.fn()}
            onAsk={onAsk}
          />
        </StudioProvider>
      </ToastProvider>,
    );
    return onAsk;
  }

  it('says a course that is not valid, or over the size limit, stops Save', () => {
    const b = base();
    const work = change(b, (c) => {
      (chapterOf(c, 'p1').items[0] as Lesson).title = '';
      (chapterOf(c, 'p1').items[1] as Lesson).blocks = Array.from({ length: 50 }, (_, i) => ({
        type: 'markdown' as const,
        id: `big${i}`,
        md: 'x'.repeat(19_000),
      }));
    });
    checks(work, b);
    expect(screen.getByText('Course is not valid · stops Save')).toBeTruthy();
    expect(screen.getByText(/· over the limit, stops Save$/)).toBeTruthy();
    expect(screen.getAllByText('Stops Save:', { exact: false }).length).toBe(2);
  });

  it('warns close to the limit, and offers no fix in a closed session', () => {
    const b = base();
    const work = change(b, (c) => {
      (chapterOf(c, 'p1').items[1] as Lesson).blocks = Array.from({ length: 38 }, (_, i) => ({
        type: 'markdown' as const,
        id: `big${i}`,
        md: `We leverage Git. ${'x'.repeat(19_000)}`,
      }));
    });
    checks(work, b, false);
    expect(screen.getByText(/· close to the limit$/)).toBeTruthy();
    expect(screen.getByText(/^Writing: \d+ notes$/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ask the agent to fix these' })).toBeNull();
  });

  it('lists a publish issue with no row to show, and one finding as a note', () => {
    const b = change(base(), (c) => (c.summary = ''));
    const work = change(b, (c) => {
      (chapterOf(c, 'p1').items[0] as Lesson).blocks = [
        { type: 'markdown', id: 'm', md: 'We leverage Git.' },
      ];
    });
    checks(work, b);
    expect(screen.getByText('Writing: 1 note')).toBeTruthy();
    expect(screen.getByText('Not ready to publish: 1 thing to fix first')).toBeTruthy();
    const publish = screen.getByRole('list', { name: 'Before publishing' });
    expect(within(publish).queryByRole('button')).toBeNull();
  });
});
