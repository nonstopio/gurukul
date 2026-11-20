import { describe, expect, it, vi } from 'vitest';
import type { Question, Quiz } from '@gurukul/schema';
import {
  call,
  json,
  lessonOf,
  ok,
  refused,
  toolCtx,
  toolState,
  must,
} from './session-tools-fixture';
import type { SessionState } from '../src/studio/session/tools';

const quizOf = (state: SessionState, id = 'q1'): Quiz => {
  const quiz = lessonOf(state, id);
  if (quiz?.type !== 'quiz') throw new Error('not a Quiz');
  return quiz;
};
const questionOf = (state: SessionState, id: string): Question =>
  quizOf(state).questions.find((q) => q.id === id) as Question;
const keyOf = (state: SessionState, id: string) => state.work.answers['q1']?.[id];

const question = {
  kind: 'single',
  prompt: 'What does git fetch change?',
  options: ['Your branch', 'Only remote-tracking branches'],
  correct: [1],
  explanation: 'Fetch downloads; it never touches your branch.',
};

describe('update_quiz_settings', () => {
  it('changes the title and settings; a null pass mark falls back to the course', async () => {
    const state = toolState();
    quizOf(state).passMark = 0.9;
    const { state: next, text } = await ok(
      call(state, 'update_quiz_settings', {
        quizId: 'q1',
        title: 'Rewriting check',
        passMarkPercent: null,
        questionsShown: 1,
        shuffleOptions: false,
        cooldownMinutes: 0,
        revealAnswers: 'never',
        blocksNext: false,
      }),
    );
    const quiz = quizOf(next);
    expect(quiz).toMatchObject({
      title: 'Rewriting check',
      questionsShown: 1,
      shuffleOptions: false,
      cooldownMinutes: 0,
      revealAnswers: 'never',
      blocksNext: false,
    });
    expect('passMark' in quiz).toBe(false);
    expect(text).toMatch(/^Updated the Quiz settings: passMark, questionsShown/);
    const mark = await ok(
      call(toolState(), 'update_quiz_settings', { quizId: 'q1', passMarkPercent: 85 }),
    );
    expect(quizOf(mark.state).passMark).toBe(0.85);
  });

  it('refuses showing more questions than the Quiz has', async () => {
    expect(
      await refused(call(toolState(), 'update_quiz_settings', { quizId: 'q1', questionsShown: 3 })),
    ).toBe('questionsShown is 3, but the Quiz has 2 questions. Show at most 2.');
    const state = toolState();
    quizOf(state).questions = [must(quizOf(state).questions[0])];
    quizOf(state).questionsShown = 1;
    expect(
      await refused(call(state, 'update_quiz_settings', { quizId: 'q1', questionsShown: 2 })),
    ).toBe('questionsShown is 2, but the Quiz has 1 question. Show at most 1.');
  });

  it('refuses an empty change, a lesson and an unknown Quiz', async () => {
    expect(await refused(call(toolState(), 'update_quiz_settings', { quizId: 'q1' }))).toBe(
      'Give at least one setting to change.',
    );
    expect(
      await refused(call(toolState(), 'update_quiz_settings', { quizId: 'l1', title: 'X' })),
    ).toBe('"l1" is a lesson, not a Quiz. Use the lesson and block tools for it.');
    expect(
      await refused(call(toolState(), 'update_quiz_settings', { quizId: 'zz', title: 'X' })),
    ).toMatch(/^There is no lesson or Quiz/);
  });
});

describe('add_question', () => {
  it('adds a question with made ids and its key, at the end or a position', async () => {
    const { state, text } = await ok(call(toolState(), 'add_question', { quizId: 'q1', question }));
    const added = must(quizOf(state).questions[2]);
    expect(added.id).toMatch(/^q-[0-9a-f]{8}$/);
    expect(added.options.map((o) => o.id)).toEqual([
      expect.stringMatching(/^o-/),
      expect.stringMatching(/^o-/),
    ]);
    expect(keyOf(state, added.id)).toEqual([must(added.options[1]).id]);
    expect(text).toBe(`Added question ${added.id} at position 3 of 3.`);
    const first = await ok(
      call(toolState(), 'add_question', {
        quizId: 'q1',
        position: 1,
        question: { ...question, code: 'git fetch', reviewItemId: 'l2' },
      }),
    );
    expect(quizOf(first.state).questions[0]).toMatchObject({
      code: 'git fetch',
      reviewItemId: 'l2',
    });
  });

  it('adds multiple choice with several right answers, and true or false', async () => {
    const multi = await ok(
      call(toolState(), 'add_question', {
        quizId: 'q1',
        question: { ...question, kind: 'multiple', options: ['A', 'B', 'C'], correct: [0, 2, 2] },
      }),
    );
    const q = must(quizOf(multi.state).questions[2]);
    expect(keyOf(multi.state, q.id)).toEqual([must(q.options[0]).id, must(q.options[2]).id]);
    const tf = await ok(
      call(toolState(), 'add_question', {
        quizId: 'q1',
        question: { ...question, kind: 'trueFalse', options: ['True', 'False'], correct: [0] },
      }),
    );
    expect(quizOf(tf.state).questions[2]?.options.map((o) => o.text)).toEqual(['True', 'False']);
  });

  it('refuses what a question cannot be', async () => {
    const add = (q: object) =>
      refused(call(toolState(), 'add_question', { quizId: 'q1', question: { ...question, ...q } }));
    expect(await add({ kind: 'trueFalse', options: ['Yes', 'No'] })).toBe(
      'A true or false question has the answers True and False; leave options out.',
    );
    expect(await add({ options: undefined })).toBe('Give 2 to 6 options.');
    expect(await add({ correct: [0, 1] })).toBe(
      'A "Single choice" question has exactly one right answer. Give correct with one index.',
    );
    expect(await add({ correct: [2] })).toBe(
      'correct lists 2, but there are only 2 answers (counted from 0).',
    );
    expect(await add({ reviewItemId: 'q1' })).toBe(
      'reviewItemId: "q1" is a Quiz, not a lesson. Use the Quiz tools for it.',
    );
    expect(await add({ explanation: ' ' })).toMatch(/^The input for add_question is not valid\./);
    expect(await refused(call(toolState(), 'add_question', { quizId: 'l1', question }))).toMatch(
      /is a lesson, not a Quiz/,
    );
  });

  it('refuses a 61st question with the limit in words', async () => {
    const state = toolState();
    const base = must(quizOf(state).questions[0]);
    quizOf(state).questions = Array.from({ length: 60 }, (_, i) => ({ ...base, id: `x${i}` }));
    expect(await refused(call(state, 'add_question', { quizId: 'q1', question }))).toBe(
      'Nothing was changed. A Quiz holds at most 60 questions.',
    );
  });
});

describe('update_question', () => {
  it('rewords answers in place and keeps the right ones marked', async () => {
    const { state, text } = await ok(
      call(toolState(), 'update_question', {
        quizId: 'q1',
        questionId: 'k1',
        prompt: 'Which command replays commits?',
        options: [
          { id: 'a', text: 'git rebase main' },
          { text: 'git cherry-pick' },
          { id: 'b', text: 'git status' },
        ],
        explanation: 'Rebase replays each commit.',
      }),
    );
    const q = questionOf(state, 'k1');
    expect(q.prompt).toBe('Which command replays commits?');
    expect(q.options.map((o) => o.id)).toEqual(['a', expect.stringMatching(/^o-/), 'b']);
    expect(keyOf(state, 'k1')).toEqual(['a']);
    expect(text).toBe('Updated question k1: prompt, options, explanation.');
  });

  it('sets the right answers, the code and the lesson it revisits, and clears them', async () => {
    const set = await ok(
      call(toolState(), 'update_question', {
        quizId: 'q1',
        questionId: 'k1',
        correct: [1],
        code: 'git rebase -i',
        reviewItemId: 'l1',
      }),
    );
    expect(keyOf(set.state, 'k1')).toEqual(['b']);
    expect(questionOf(set.state, 'k1')).toMatchObject({
      code: 'git rebase -i',
      reviewItemId: 'l1',
    });
    const cleared = await ok(
      call(set.state, 'update_question', {
        quizId: 'q1',
        questionId: 'k1',
        code: '',
        reviewItemId: null,
      }),
    );
    expect('code' in questionOf(cleared.state, 'k1')).toBe(false);
    expect('reviewItemId' in questionOf(cleared.state, 'k1')).toBe(false);
  });

  it('changes kind: to true or false keeps option ids, and single choice needs one answer', async () => {
    const tf = await ok(
      call(toolState(), 'update_question', {
        quizId: 'q1',
        questionId: 'k1',
        kind: 'trueFalse',
        prompt: 'Rebase rewrites history.',
        correct: [0],
      }),
    );
    expect(questionOf(tf.state, 'k1').options).toEqual([
      { id: 'a', text: 'True' },
      { id: 'b', text: 'False' },
    ]);
    expect(keyOf(tf.state, 'k1')).toEqual(['a']);
    expect(
      await refused(
        call(toolState(), 'update_question', { quizId: 'q1', questionId: 'k2', kind: 'single' }),
      ),
    ).toBe('A "Single choice" question has exactly one right answer. Give correct with one index.');
    const single = await ok(
      call(toolState(), 'update_question', {
        quizId: 'q1',
        questionId: 'k2',
        kind: 'single',
        correct: [1],
      }),
    );
    expect(keyOf(single.state, 'k2')).toEqual(['d']);
  });

  it('refuses to turn a question into true or false without saying which is right', async () => {
    // The old right answer was in position 1 or 2 by chance; it must not become True or False.
    const say = 'Say which is right: give correct as [0] for True or [1] for False.';
    for (const questionId of ['k1', 'k2'])
      expect(
        await refused(
          call(toolState(), 'update_question', { quizId: 'q1', questionId, kind: 'trueFalse' }),
        ),
      ).toBe(say);
    const state = (
      await ok(
        call(toolState(), 'update_question', {
          quizId: 'q1',
          questionId: 'k1',
          kind: 'trueFalse',
          correct: [1],
        }),
      )
    ).state;
    // Already true or false: the stored answer stays when correct is left out.
    const again = await ok(
      call(state, 'update_question', { quizId: 'q1', questionId: 'k1', kind: 'trueFalse' }),
    );
    expect(keyOf(again.state, 'k1')).toEqual(['b']);
  });

  it('works on a question with no key stored yet when correct is given', async () => {
    const state = toolState();
    state.work.answers = {};
    const { state: next } = await ok(
      call(state, 'update_question', { quizId: 'q1', questionId: 'k1', correct: [0] }),
    );
    expect(keyOf(next, 'k1')).toEqual(['a']);
    expect(
      await refused(
        call(state, 'update_question', { quizId: 'q1', questionId: 'k1', prompt: 'Why?' }),
      ),
    ).toBe('None of the answers marked right are left. Give correct as well.');
  });

  it('refuses edits it cannot make sense of', async () => {
    const edit = (input: object) =>
      refused(call(toolState(), 'update_question', { quizId: 'q1', questionId: 'k1', ...input }));
    expect(await edit({})).toBe('Give at least one field to change.');
    expect(await edit({ kind: 'trueFalse', options: [{ text: 'Yes' }, { text: 'No' }] })).toBe(
      'A true or false question has the answers True and False; leave options out.',
    );
    expect(await edit({ options: [{ id: 'zz', text: 'X' }, { text: 'Y' }] })).toBe(
      'The question has no answer "zz"; leave id out for a new answer.',
    );
    expect(
      await edit({
        options: [
          { id: 'a', text: 'X' },
          { id: 'a', text: 'Y' },
        ],
      }),
    ).toBe('An answer id is given twice.');
    expect(await edit({ options: [{ id: 'b', text: 'X' }, { text: 'Y' }] })).toBe(
      'None of the answers marked right are left. Give correct as well.',
    );
    expect(await edit({ correct: [5] })).toBe(
      'correct lists 5, but there are only 2 answers (counted from 0).',
    );
    expect(await edit({ reviewItemId: 'zz' })).toMatch(/^reviewItemId: There is no lesson or Quiz/);
    expect(
      await refused(
        call(toolState(), 'update_question', { quizId: 'q1', questionId: 'zz', prompt: 'X' }),
      ),
    ).toBe('The Quiz has no question "zz". Call get_item to see the ids.');
    expect(
      await refused(
        call(toolState(), 'update_question', { quizId: 'zz', questionId: 'k1', prompt: 'X' }),
      ),
    ).toMatch(/^There is no lesson or Quiz/);
  });
});

describe('move_question and remove_question', () => {
  it('moves a question', async () => {
    const { state, text } = await ok(
      call(toolState(), 'move_question', { quizId: 'q1', questionId: 'k2', position: 1 }),
    );
    expect(quizOf(state).questions.map((q) => q.id)).toEqual(['k2', 'k1']);
    expect(text).toBe('Moved question k2 to position 1.');
  });

  it('removes a question and its key, but never the last one', async () => {
    const { state, text } = await ok(
      call(toolState(), 'remove_question', { quizId: 'q1', questionId: 'k2' }),
    );
    expect(quizOf(state).questions.map((q) => q.id)).toEqual(['k1']);
    expect(quizOf(state).questionsShown).toBe(1);
    expect(keyOf(state, 'k2')).toBeUndefined();
    expect(text).toBe('Removed question k2.');
    expect(await refused(call(state, 'remove_question', { quizId: 'q1', questionId: 'k1' }))).toBe(
      'A Quiz needs at least one question. To drop the whole Quiz, use remove_item.',
    );
  });

  it('refuses unknown questions and Quizzes', async () => {
    const none = 'The Quiz has no question "zz". Call get_item to see the ids.';
    expect(
      await refused(
        call(toolState(), 'move_question', { quizId: 'q1', questionId: 'zz', position: 1 }),
      ),
    ).toBe(none);
    expect(
      await refused(call(toolState(), 'remove_question', { quizId: 'q1', questionId: 'zz' })),
    ).toBe(none);
    expect(
      await refused(
        call(toolState(), 'move_question', { quizId: 'l1', questionId: 'k1', position: 1 }),
      ),
    ).toMatch(/is a lesson/);
    expect(
      await refused(call(toolState(), 'remove_question', { quizId: 'l1', questionId: 'k1' })),
    ).toMatch(/is a lesson/);
  });
});

describe('check_course', () => {
  it('reports a valid course, its size and what stops publishing', async () => {
    const out = await json<Record<string, unknown>>(call(toolState(), 'check_course'));
    expect(out).toMatchObject({
      valid: true,
      problems: [],
      size: { limit: 900_000, overLimit: false, nearLimit: false },
      readyToPublish: false,
      publishIssueCount: 1,
      publishIssues: [{ code: 'lesson.empty', itemId: 'l3' }],
      todosLeft: 0,
    });
    const filled = await ok(
      call(toolState(), 'add_block', {
        lessonId: 'l3',
        block: { type: 'markdown', md: 'Rebase.' },
      }),
    );
    const ready = await json<Record<string, unknown>>(call(filled.state, 'check_course'));
    expect(ready).toMatchObject({ readyToPublish: true, publishIssueCount: 0 });
  });

  it('describes schema problems and publish issues, and counts to-dos left', async () => {
    const state = toolState({
      todos: [
        { id: 't1', text: 'Screenshot', done: false, createdAt: '2026-11-19T10:00:00Z' },
        { id: 't2', text: 'Done', done: true, createdAt: '2026-11-19T10:00:00Z' },
      ],
    });
    must(state.work.course.chapters[0]).title = '';
    state.work.answers = { q1: {} };
    const out = await json<Record<string, unknown>>(call(state, 'check_course'));
    expect(out['valid']).toBe(false);
    expect(out['problems']).toEqual(['In chapter "p1", title cannot be empty.']);
    expect(out['readyToPublish']).toBe(false);
    expect(out['publishIssueCount']).toBeGreaterThan(1);
    expect(out['todosLeft']).toBe(1);
  });

  it('warns near the size limit and says when it is over', async () => {
    const state = toolState();
    state.work.answers = { ...state.work.answers, filler: { x: ['y'.repeat(910_000)] } };
    const out = await json<{ size: Record<string, unknown> }>(call(state, 'check_course'));
    expect(out.size).toMatchObject({ overLimit: true, nearLimit: true });
  });
});

describe('lint_writing', () => {
  it('runs the lint on the whole course or one item, and lists its findings', async () => {
    const finding = {
      itemId: 'l1',
      blockId: 'b1',
      field: 'md',
      rule: 'worn-phrase',
      excerpt: 'delve',
    };
    const lintWriting = vi.fn(() => [finding]);
    const ctx = toolCtx({ lintWriting });
    const state = toolState();
    expect(await json(call(state, 'lint_writing', {}, ctx))).toEqual({
      count: 1,
      findings: [finding],
    });
    expect(lintWriting).toHaveBeenLastCalledWith(state.work, { itemId: null });
    await ok(call(state, 'lint_writing', { itemId: 'l1' }, ctx));
    expect(lintWriting).toHaveBeenLastCalledWith(state.work, { itemId: 'l1' });
  });

  it('refuses an unknown item without running the lint', async () => {
    const ctx = toolCtx();
    expect(await refused(call(toolState(), 'lint_writing', { itemId: 'zz' }, ctx))).toMatch(
      /^There is no lesson or Quiz/,
    );
    expect(ctx.lintWriting).not.toHaveBeenCalled();
  });
});

describe('set_summary', () => {
  it('sets the title, goals and summary, saying how many goals are done', async () => {
    const { state, text } = await ok(
      call(toolState(), 'set_summary', {
        title: 'Simplify chapter 2',
        goals: [
          { text: 'Simplify chapter 2', done: true },
          { text: 'Add a Quiz', done: false },
        ],
        summary: 'Rewrote the rebase lesson.',
      }),
    );
    expect(state).toMatchObject({
      title: 'Simplify chapter 2',
      summary: 'Rewrote the rebase lesson.',
    });
    expect(text).toBe('Saved the session record: 1 of 2 goals done.');
    const only = await ok(call(toolState(), 'set_summary', { summary: 'Just this.' }));
    expect(only.state.title).toBe('Simplify the history chapter');
  });

  it('refuses an empty change and too many goals', async () => {
    expect(await refused(call(toolState(), 'set_summary', {}))).toBe(
      'Give at least one of title, goals or summary.',
    );
    const goals = Array.from({ length: 21 }, () => ({ text: 'x', done: false }));
    expect(await refused(call(toolState(), 'set_summary', { goals }))).toMatch(
      /^The input for set_summary is not valid\./,
    );
  });
});

describe('add_todo and resolve_todo', () => {
  it('adds a to-do with an id and time made by the app, pointing at a block', async () => {
    const { state, text } = await ok(
      call(toolState(), 'add_todo', {
        text: 'Screenshot of the rebase conflict screen, after block 1',
        itemId: 'l1',
        blockId: 'b1',
      }),
    );
    const todo = must(state.todos[0]);
    expect(todo).toEqual({
      id: expect.stringMatching(/^todo-[0-9a-f]{8}$/),
      text: 'Screenshot of the rebase conflict screen, after block 1',
      itemId: 'l1',
      blockId: 'b1',
      done: false,
      createdAt: '2026-11-19T10:00:00.000Z',
    });
    expect(text).toBe(`Added to-do ${todo.id}.`);
    const plain = await ok(call(toolState(), 'add_todo', { text: 'Check the version number' }));
    expect(plain.state.todos[0]).not.toHaveProperty('itemId');
    const onItem = await ok(call(toolState(), 'add_todo', { text: 'Add a video', itemId: 'q1' }));
    expect(onItem.state.todos[0]).toMatchObject({ itemId: 'q1' });
  });

  it('refuses a block without its lesson, or one that is not there', async () => {
    expect(await refused(call(toolState(), 'add_todo', { text: 'X', blockId: 'b1' }))).toBe(
      'Give the itemId of the lesson that holds the block.',
    );
    expect(
      await refused(call(toolState(), 'add_todo', { text: 'X', itemId: 'l2', blockId: 'b1' })),
    ).toBe('"l2" has no block "b1". Call get_item to see its blocks.');
    expect(
      await refused(call(toolState(), 'add_todo', { text: 'X', itemId: 'q1', blockId: 'b1' })),
    ).toBe('"q1" has no block "b1". Call get_item to see its blocks.');
    expect(
      await refused(call(toolState(), 'add_todo', { text: 'X', itemId: 'zz', blockId: 'b1' })),
    ).toMatch(/^There is no lesson or Quiz/);
    expect(await refused(call(toolState(), 'add_todo', { text: 'X', itemId: 'zz' }))).toMatch(
      /^There is no lesson or Quiz/,
    );
  });

  it('refuses a 101st to-do with the limit in words', async () => {
    const todos = Array.from({ length: 100 }, (_, i) => ({
      id: `t${i}`,
      text: 'x',
      done: false,
      createdAt: '2026-11-19T10:00:00Z',
    }));
    expect(await refused(call(toolState({ todos }), 'add_todo', { text: 'One more' }))).toBe(
      'Nothing was changed. A session has at most 100 to-dos. Resolve or combine some first.',
    );
  });

  it('marks a to-do done, or not done again', async () => {
    const other = { id: 't0', text: 'Other', done: false, createdAt: '2026-11-19T10:00:00Z' };
    const first = await ok(call(toolState({ todos: [other] }), 'add_todo', { text: 'Screenshot' }));
    const added = { state: { ...first.state, todos: first.state.todos.slice(1).concat(other) } };
    const id = must(added.state.todos[0]).id;
    const resolved = await ok(call(added.state, 'resolve_todo', { todoId: id }));
    expect(resolved.state.todos.map((t) => t.done)).toEqual([true, false]);
    expect(resolved.text).toBe(`Marked to-do ${id} done.`);
    const reopened = await ok(call(resolved.state, 'resolve_todo', { todoId: id, done: false }));
    expect(reopened.state.todos[0]?.done).toBe(false);
    expect(reopened.text).toBe(`Marked to-do ${id} not done.`);
    expect(await refused(call(toolState(), 'resolve_todo', { todoId: 'zz' }))).toBe(
      'There is no to-do "zz". Call get_course to see them.',
    );
  });
});
