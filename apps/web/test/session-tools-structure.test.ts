import { describe, expect, it } from 'vitest';
import { workingSchema } from '@gurukul/schema';
import { call, lessonOf, ok, refused, toolCtx, toolState, must } from './session-tools-fixture';
import type { SessionState } from '../src/studio/session/tools';

const ids = (state: SessionState) =>
  state.work.course.chapters.map((p) => `${p.id}:${p.items.map((i) => i.id).join(',')}`);

const question = {
  kind: 'single',
  prompt: 'Which command replays commits?',
  options: ['git rebase', 'git log'],
  correct: [0],
  explanation: 'Rebase replays your commits on top of another branch.',
};

describe('the fixture', () => {
  it('is a valid working copy', () => {
    expect(workingSchema.safeParse(toolState().work).success).toBe(true);
  });
});

describe('set_course_details', () => {
  it('changes only the fields given', async () => {
    const { state, text } = await ok(
      call(toolState(), 'set_course_details', {
        title: 'Git for teams',
        summary: 'Short.',
        level: 'advanced',
        coverTheme: 'sky',
        coverGlyph: 'Gt',
        passMarkPercent: 80,
        sequential: false,
        certificate: false,
        requireVideoWatch: true,
        certificateTitle: 'Git expert',
      }),
    );
    const c = state.work.course;
    expect(c).toMatchObject({
      title: 'Git for teams',
      summary: 'Short.',
      level: 'advanced',
      cover: { theme: 'sky', glyph: 'Gt' },
      rules: { sequential: false, certificate: false, requireVideoWatch: true, passMark: 0.8 },
      certificate: { title: 'Git expert' },
    });
    expect(text).toMatch(/^Updated title, summary, level/);
    const one = await ok(call(toolState(), 'set_course_details', { summary: 'Only this.' }));
    expect(one.state.work.course.title).toBe('Git, the NonStop Way');
  });

  it('refuses an empty change', async () => {
    expect(await refused(call(toolState(), 'set_course_details', {}))).toBe(
      'Give at least one field to change.',
    );
  });
});

describe('set_landing', () => {
  it('sets the description and replaces the outcomes', async () => {
    const { state, text } = await ok(
      call(toolState(), 'set_landing', { description: 'New.', outcomes: ['One', 'Two', 'Three'] }),
    );
    expect(state.work.course.description).toBe('New.');
    expect(state.work.course.outcomes).toEqual(['One', 'Two', 'Three']);
    expect(text).toBe('Updated the landing page: description, 3 outcomes.');
    const only = await ok(call(toolState(), 'set_landing', { description: 'Only.' }));
    expect(only.text).toBe('Updated the landing page: description.');
    expect(only.state.work.course.outcomes).toHaveLength(2);
    const outcomes = await ok(call(toolState(), 'set_landing', { outcomes: ['A', 'B'] }));
    expect(outcomes.text).toBe('Updated the landing page: 2 outcomes.');
  });

  it('refuses an empty change and too many outcomes', async () => {
    expect(await refused(call(toolState(), 'set_landing', {}))).toBe(
      'Give at least one field to change.',
    );
    expect(
      await refused(call(toolState(), 'set_landing', { outcomes: Array(13).fill('x') })),
    ).toMatch(/^The input for set_landing is not valid\./);
  });
});

describe('chapters', () => {
  it('adds a chapter with an id made by the app, at the end or at a position', async () => {
    const end = await ok(call(toolState(), 'add_chapter', { title: 'Recovery' }));
    const made = must(end.state.work.course.chapters[2]);
    expect(made.id).toMatch(/^chapter-[0-9a-f]{8}$/);
    expect(made).toMatchObject({ title: 'Recovery', items: [] });
    expect(end.text).toBe(`Added chapter ${made.id} at position 3.`);
    const first = await ok(call(toolState(), 'add_chapter', { title: 'Why Git', position: 1 }));
    expect(first.state.work.course.chapters[0]?.title).toBe('Why Git');
  });

  it('refuses a 31st chapter with the limit in words', async () => {
    const state = toolState();
    state.work.course.chapters = Array.from({ length: 30 }, (_, i) => ({
      id: `c${i}`,
      title: `C${i}`,
      items: [],
    }));
    expect(await refused(call(state, 'add_chapter', { title: 'One more' }))).toBe(
      'Nothing was changed. A course holds at most 30 chapters.',
    );
  });

  it('renames, moves and removes a chapter', async () => {
    const renamed = await ok(
      call(toolState(), 'update_chapter', { chapterId: 'p2', title: 'Rewriting' }),
    );
    expect(renamed.state.work.course.chapters[1]?.title).toBe('Rewriting');
    const moved = await ok(call(toolState(), 'move_chapter', { chapterId: 'p2', position: 1 }));
    expect(ids(moved.state)).toEqual(['p2:q1,l3', 'p1:l1,l2']);
    expect(moved.text).toBe('Moved chapter p2 to position 1.');
    const removed = await ok(call(toolState(), 'remove_chapter', { chapterId: 'p2' }));
    expect(ids(removed.state)).toEqual(['p1:l1,l2']);
    expect(removed.state.work.answers['q1']).toBeUndefined();
    expect(removed.text).toBe('Removed chapter "History" (p2) and the 2 items in it.');
  });

  it('counts one item in a removed chapter in the singular', async () => {
    const state = toolState();
    must(state.work.course.chapters[1]).items = [
      must(must(state.work.course.chapters[1]).items[1]),
    ];
    const removed = await ok(call(state, 'remove_chapter', { chapterId: 'p2' }));
    expect(removed.text).toBe('Removed chapter "History" (p2) and the 1 item in it.');
  });

  it('refuses unknown chapters', async () => {
    const unknown = 'There is no chapter with id "p9". Call get_course to see the ids.';
    for (const [name, input] of [
      ['update_chapter', { chapterId: 'p9', title: 'X' }],
      ['move_chapter', { chapterId: 'p9', position: 1 }],
      ['remove_chapter', { chapterId: 'p9' }],
      ['add_lesson', { chapterId: 'p9', title: 'X' }],
      ['add_quiz', { chapterId: 'p9', title: 'X', questions: [question] }],
    ] as const)
      expect(await refused(call(toolState(), name, input))).toBe(unknown);
  });
});

describe('add_lesson', () => {
  it('adds a titled lesson with its settings, at the end of a chapter', async () => {
    const { state, text } = await ok(
      call(toolState(), 'add_lesson', {
        chapterId: 'p2',
        title: 'Interactive rebase',
        minutes: 12,
        layout: 'split',
        completeWhen: 'scrolled',
        kindLabel: 'Lab',
      }),
    );
    const made = must(must(state.work.course.chapters[1]).items[2]);
    expect(made).toMatchObject({
      type: 'lesson',
      title: 'Interactive rebase',
      minutes: 12,
      layout: 'split',
      completeWhen: 'scrolled',
      kindLabel: 'Lab',
      blocks: [],
    });
    expect(made.id).toMatch(/^lesson-[0-9a-f]{8}$/);
    expect(text).toBe(`Added lesson ${made.id} at position 3 of chapter p2.`);
  });

  it('puts it at a position and keeps defaults it was not given', async () => {
    const { state } = await ok(
      call(toolState(), 'add_lesson', {
        chapterId: 'p1',
        title: 'Setup',
        position: 1,
        kindLabel: '',
      }),
    );
    const made = must(must(state.work.course.chapters[0]).items[0]);
    expect(made).toMatchObject({ title: 'Setup', minutes: 5, layout: 'stacked' });
    expect('kindLabel' in made).toBe(false);
  });
});

describe('add_quiz', () => {
  it('adds a Quiz with its questions, keys and settings, showing every question by default', async () => {
    const { state, text } = await ok(
      call(toolState(), 'add_quiz', {
        chapterId: 'p1',
        title: 'Basics check',
        questions: [question, { ...question, kind: 'trueFalse', options: undefined, correct: [1] }],
        passMarkPercent: 80,
        revealAnswers: 'onPass',
        position: 1,
      }),
    );
    const quiz = must(must(state.work.course.chapters[0]).items[0]);
    if (quiz.type !== 'quiz') throw new Error('expected a Quiz');
    expect(quiz).toMatchObject({
      title: 'Basics check',
      questionsShown: 2,
      passMark: 0.8,
      revealAnswers: 'onPass',
    });
    const [q1, q2] = quiz.questions;
    expect(q2?.options.map((o) => o.text)).toEqual(['True', 'False']);
    expect(state.work.answers[quiz.id]).toEqual({
      [must(q1).id]: [must(must(q1).options[0]).id],
      [must(q2).id]: [must(must(q2).options[1]).id],
    });
    expect(text).toBe(
      `Added Quiz ${quiz.id} with questions ${must(q1).id}, ${must(q2).id} at position 1 of chapter p1.`,
    );
  });

  it('refuses a bad question, naming which', async () => {
    const error = await refused(
      call(toolState(), 'add_quiz', {
        chapterId: 'p1',
        title: 'Check',
        questions: [question, { ...question, correct: [5] }],
      }),
    );
    expect(error).toBe(
      'Question 2: correct lists 5, but there are only 2 answers (counted from 0).',
    );
  });

  it('refuses showing more questions than there are', async () => {
    expect(
      await refused(
        call(toolState(), 'add_quiz', {
          chapterId: 'p1',
          title: 'Check',
          questions: [question],
          questionsShown: 3,
        }),
      ),
    ).toBe('questionsShown is 3, but the Quiz has 1 questions.');
  });

  it('refuses a Quiz without questions', async () => {
    expect(
      await refused(
        call(toolState(), 'add_quiz', { chapterId: 'p1', title: 'Empty', questions: [] }),
      ),
    ).toMatch(/^The input for add_quiz is not valid\./);
  });
});

describe('update_item', () => {
  it('renames a lesson and changes its settings; an empty label removes it', async () => {
    const state = toolState();
    const l1 = lessonOf(state, 'l1');
    if (l1?.type === 'lesson') l1.kindLabel = 'Lab';
    const { state: next, text } = await ok(
      call(state, 'update_item', { itemId: 'l1', title: 'Commit', minutes: 3, kindLabel: '' }),
    );
    const lesson = lessonOf(next, 'l1');
    expect(lesson).toMatchObject({ title: 'Commit', minutes: 3 });
    expect(lesson && 'kindLabel' in lesson).toBe(false);
    expect(text).toBe('Updated l1.');
    const settingsOnly = await ok(
      call(toolState(), 'update_item', { itemId: 'l1', layout: 'article' }),
    );
    expect(lessonOf(settingsOnly.state, 'l1')).toMatchObject({
      title: 'First commit',
      layout: 'article',
    });
  });

  it('renames a Quiz but refuses lesson settings on it', async () => {
    const { state } = await ok(call(toolState(), 'update_item', { itemId: 'q1', title: 'Check' }));
    expect(lessonOf(state, 'q1')?.title).toBe('Check');
    expect(await refused(call(toolState(), 'update_item', { itemId: 'q1', minutes: 3 }))).toBe(
      'minutes are lesson settings, and "q1" is a Quiz. Use update_quiz_settings.',
    );
  });

  it('refuses an unknown item and an empty change', async () => {
    expect(await refused(call(toolState(), 'update_item', { itemId: 'zz', title: 'X' }))).toMatch(
      /^There is no lesson or Quiz with id "zz"/,
    );
    expect(await refused(call(toolState(), 'update_item', { itemId: 'l1' }))).toBe(
      'Give at least one field to change.',
    );
  });
});

describe('move_item', () => {
  it('moves within its chapter', async () => {
    const { state, text } = await ok(call(toolState(), 'move_item', { itemId: 'l2', position: 1 }));
    expect(ids(state)).toEqual(['p1:l2,l1', 'p2:q1,l3']);
    expect(text).toBe('Moved l2 to position 1.');
    const same = await ok(
      call(toolState(), 'move_item', { itemId: 'l2', chapterId: 'p1', position: 1 }),
    );
    expect(ids(same.state)).toEqual(['p1:l2,l1', 'p2:q1,l3']);
  });

  it('moves to another chapter, at the end or at a position', async () => {
    const end = await ok(call(toolState(), 'move_item', { itemId: 'l1', chapterId: 'p2' }));
    expect(ids(end.state)).toEqual(['p1:l2', 'p2:q1,l3,l1']);
    expect(end.text).toBe('Moved l1 to position 3 of chapter p2.');
    const first = await ok(
      call(toolState(), 'move_item', { itemId: 'q1', chapterId: 'p1', position: 1 }),
    );
    expect(ids(first.state)).toEqual(['p1:q1,l1,l2', 'p2:l3']);
    expect(first.state.work.answers['q1']).toEqual({ k1: ['a'], k2: ['c', 'd'] });
  });

  it('refuses an unknown item or chapter, and a move to nowhere', async () => {
    expect(await refused(call(toolState(), 'move_item', { itemId: 'zz', position: 1 }))).toMatch(
      /^There is no lesson or Quiz/,
    );
    expect(
      await refused(call(toolState(), 'move_item', { itemId: 'l1', chapterId: 'p9' })),
    ).toMatch(/^There is no chapter with id "p9"/);
    expect(await refused(call(toolState(), 'move_item', { itemId: 'l1' }))).toBe(
      'Give a chapterId or a position to move it to.',
    );
  });
});

describe('remove_item', () => {
  it('removes a lesson, and a Quiz with its keys', async () => {
    const lesson = await ok(call(toolState(), 'remove_item', { itemId: 'l2' }));
    expect(ids(lesson.state)).toEqual(['p1:l1', 'p2:q1,l3']);
    expect(lesson.text).toBe('Removed lesson "Branches" (l2).');
    const quiz = await ok(call(toolState(), 'remove_item', { itemId: 'q1' }));
    expect(quiz.state.work.answers['q1']).toBeUndefined();
    expect(quiz.text).toBe('Removed Quiz "History check" (q1).');
  });

  it('refuses an unknown item', async () => {
    expect(await refused(call(toolState(), 'remove_item', { itemId: 'zz' }))).toMatch(
      /^There is no lesson or Quiz/,
    );
  });
});

describe('ids', () => {
  it('are never taken from the model', async () => {
    const error = await refused(
      call(toolState(), 'add_chapter', { title: 'X', id: 'my-id' }, toolCtx()),
    );
    expect(error).toMatch(/^The input for add_chapter is not valid\. Unrecognized key/);
  });
});
