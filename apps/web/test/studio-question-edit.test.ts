import { courseStatsSchema, questionSchema } from '@gurukul/schema';
import type { Question } from '@gurukul/schema';
import { describe, expect, it } from 'vitest';
import {
  addAnswer,
  addQuestion,
  bankEntry,
  changeKind,
  findQuiz,
  importFromBank,
  firstTryPercent,
  isLowFirstTry,
  matchBank,
  moveQuestion,
  newQuestion,
  parseCooldown,
  parsePassMark,
  parseShown,
  parseTags,
  passMarkText,
  removeAnswer,
  removeQuestion,
  setAnswerText,
  syncKey,
  toggleCorrect,
  updateQuiz,
  updateQuestion,
} from '../src/studio/questionEdit';
import type { Keyed } from '../src/studio/questionEdit';
import type { BankQuestion, Working } from '../src/studio/types';
import { makeCourse } from './fake-data';

const opts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `o${i + 1}`, text: `Answer ${i + 1}` }));
const q = (over: Partial<Question> = {}): Question => ({
  id: 'k1',
  kind: 'single',
  prompt: 'Which?',
  options: opts(3),
  explanation: 'Because',
  reviewItemId: 'l1',
  ...over,
});
const keyed = (over: Partial<Question> = {}, key = ['o1']): Keyed => ({ question: q(over), key });

describe('syncKey', () => {
  it('drops ids that no longer exist', () => {
    expect(syncKey('multiple', opts(3), ['o1', 'gone', 'o3'])).toEqual(['o1', 'o3']);
  });
  it('keeps exactly one for single choice, true or false and code output', () => {
    for (const kind of ['single', 'trueFalse', 'codeOutput'] as const) {
      expect(syncKey(kind, opts(3), ['o2', 'o3'])).toEqual(['o2']);
    }
  });
  it('falls back to the first option when nothing valid is left', () => {
    expect(syncKey('single', opts(3), ['gone'])).toEqual(['o1']);
    expect(syncKey('multiple', opts(3), [])).toEqual(['o1']);
  });
});

describe('a new question', () => {
  it('is single choice with two answers, the first correct, and valid for the schema', () => {
    const made = newQuestion();
    expect(questionSchema.safeParse(made.question).success).toBe(true);
    expect(made.question.options).toHaveLength(2);
    expect(made.key).toEqual([made.question.options[0]?.id]);
    expect(made.question.id).toMatch(/^q-[0-9a-f]{8}$/);
  });
});

describe('changing the kind', () => {
  it('locks true or false to two fixed answers, keeping the ids of the first two', () => {
    const out = changeKind(keyed({}, ['o3']), 'trueFalse');
    expect(out.question.options).toEqual([
      { id: 'o1', text: 'True' },
      { id: 'o2', text: 'False' },
    ]);
    expect(out.key).toEqual(['o1']);
  });

  it('makes new ids when there are fewer than two options', () => {
    const out = changeKind(keyed({ options: opts(1) }), 'trueFalse');
    expect(out.question.options[0]?.id).toBe('o1');
    expect(out.question.options[1]?.id).toMatch(/^o-[0-9a-f]{8}$/);
  });

  it('keeps the correct answer when it is one of the first two', () => {
    expect(changeKind(keyed({}, ['o2']), 'trueFalse').key).toEqual(['o2']);
  });

  it('reduces several correct answers to one when leaving multiple choice', () => {
    expect(changeKind(keyed({ kind: 'multiple' }, ['o2', 'o3']), 'single').key).toEqual(['o2']);
  });

  it('keeps every correct answer when switching to multiple choice', () => {
    expect(changeKind(keyed({}, ['o2']), 'multiple').key).toEqual(['o2']);
  });

  it('leaves the answers alone when switching away from true or false', () => {
    const tf = changeKind(keyed(), 'trueFalse');
    expect(changeKind(tf, 'codeOutput').question.options).toEqual(tf.question.options);
  });
});

describe('answers', () => {
  it('adds an empty answer up to six, never for true or false', () => {
    let k = keyed({ options: opts(2) });
    for (let i = 0; i < 8; i++) k = addAnswer(k);
    expect(k.question.options).toHaveLength(6);
    expect(k.question.options[5]?.text).toBe('');
    expect(addAnswer(k)).toBe(k);
    const tf = changeKind(keyed(), 'trueFalse');
    expect(addAnswer(tf)).toBe(tf);
  });

  it('removes an answer down to two and re-syncs the key', () => {
    const k = keyed({}, ['o1']);
    const out = removeAnswer(k, 'o1');
    expect(out.question.options.map((o) => o.id)).toEqual(['o2', 'o3']);
    expect(out.key).toEqual(['o2']);
    expect(removeAnswer(out, 'o2')).toBe(out);
    const two = keyed({ options: opts(2) });
    expect(removeAnswer(two, 'o1')).toBe(two);
  });

  it('keeps the other correct answers when one of several is removed', () => {
    const k = keyed({ kind: 'multiple' }, ['o1', 'o3']);
    expect(removeAnswer(k, 'o1').key).toEqual(['o3']);
  });

  it('does not remove from true or false', () => {
    const tf = changeKind(keyed(), 'trueFalse');
    expect(removeAnswer(tf, 'o1')).toBe(tf);
  });

  it('edits the text of one answer', () => {
    expect(setAnswerText(q(), 'o2', 'Beta').options.map((o) => o.text)).toEqual([
      'Answer 1',
      'Beta',
      'Answer 3',
    ]);
  });

  it('marks exactly one correct answer for single choice', () => {
    expect(toggleCorrect('single', ['o1'], 'o3')).toEqual(['o3']);
    expect(toggleCorrect('trueFalse', ['o1'], 'o2')).toEqual(['o2']);
  });

  it('toggles answers for multiple choice but never leaves none', () => {
    expect(toggleCorrect('multiple', ['o1'], 'o2')).toEqual(['o1', 'o2']);
    expect(toggleCorrect('multiple', ['o1', 'o2'], 'o1')).toEqual(['o2']);
    expect(toggleCorrect('multiple', ['o1'], 'o1')).toEqual(['o1']);
  });
});

describe('the question bank', () => {
  const bank = (over: Partial<BankQuestion> = {}): BankQuestion => ({
    id: 'b1',
    question: q(),
    answers: ['o2'],
    tags: ['git', 'Branching'],
    createdBy: 'u1',
    ...over,
  });

  it('imports with new ids and a key that follows the new option ids', () => {
    const source = bank();
    const { question, key } = importFromBank(source);
    expect(question.id).not.toBe('k1');
    const old = new Set(['o1', 'o2', 'o3']);
    expect(question.options.every((o) => !old.has(o.id))).toBe(true);
    expect(question.options.map((o) => o.text)).toEqual(['Answer 1', 'Answer 2', 'Answer 3']);
    expect(key).toEqual([question.options[1]?.id]);
    expect('reviewItemId' in question).toBe(false);
    expect(source.question.options[0]?.id).toBe('o1');
    expect(source.question.reviewItemId).toBe('l1');
  });

  it('imports the same question twice under different ids', () => {
    const a = importFromBank(bank());
    const b = importFromBank(bank());
    expect(a.question.id).not.toBe(b.question.id);
    expect(a.question.options[0]?.id).not.toBe(b.question.options[0]?.id);
  });

  it('falls back to the first option when the stored answer is unknown', () => {
    const { question, key } = importFromBank(bank({ answers: ['unknown'] }));
    expect(key).toEqual([question.options[0]?.id]);
  });

  it('builds a bank entry without the revisit link', () => {
    const entry = bankEntry(keyed({}, ['o2']), ['git']);
    expect(entry).toEqual({
      question: expect.not.objectContaining({ reviewItemId: 'l1' }),
      answers: ['o2'],
      tags: ['git'],
    });
    expect('reviewItemId' in entry.question).toBe(false);
  });

  it('parses tags: trimmed, lower case, unique, at most ten', () => {
    expect(parseTags(' Git, git ,, Branching ')).toEqual(['git', 'branching']);
    expect(parseTags('')).toEqual([]);
    expect(parseTags(Array.from({ length: 14 }, (_, i) => `t${i}`).join(','))).toHaveLength(10);
  });

  it('searches the prompt and the tags, ignoring case', () => {
    const all = [bank(), bank({ id: 'b2', question: q({ prompt: 'Rebase?' }), tags: [] })];
    expect(matchBank(all, 'REBASE').map((b) => b.id)).toEqual(['b2']);
    expect(matchBank(all, 'branch').map((b) => b.id)).toEqual(['b1']);
    expect(matchBank(all, '  ')).toHaveLength(2);
    expect(matchBank(all, 'zzz')).toEqual([]);
  });
});

describe('low first-try score', () => {
  const stats = courseStatsSchema.parse({
    questionFirstTry: {
      low: { correct: 1, total: 4 },
      few: { correct: 0, total: 2 },
      fine: { correct: 3, total: 4 },
      half: { correct: 2, total: 4 },
    },
  });
  it('flags under half right from at least three tries', () => {
    expect(isLowFirstTry(stats, 'low')).toBe(true);
    expect(isLowFirstTry(stats, 'few')).toBe(false);
    expect(isLowFirstTry(stats, 'fine')).toBe(false);
    expect(isLowFirstTry(stats, 'half')).toBe(false);
    expect(isLowFirstTry(stats, 'unknown')).toBe(false);
    expect(isLowFirstTry(null, 'low')).toBe(false);
    expect(firstTryPercent(stats, 'low')).not.toBeNull();
    expect(firstTryPercent(stats, 'unknown')).toBeNull();
    expect(firstTryPercent(null, 'low')).toBeNull();
    expect(
      firstTryPercent({ ...stats, questionFirstTry: { none: { correct: 0, total: 0 } } }, 'none'),
    ).toBeNull();
  });
});

describe('settings values', () => {
  it('turns a typed pass mark into a fraction, blank into absent', () => {
    expect(parsePassMark('70')).toBe(0.7);
    expect(parsePassMark('150')).toBe(1);
    expect(parsePassMark('-5')).toBe(0);
    expect(parsePassMark('  ')).toBeUndefined();
    expect(parsePassMark('abc')).toBeUndefined();
    expect(passMarkText(0.7)).toBe('70');
    expect(passMarkText(undefined)).toBe('');
  });
  it('keeps questions shown between one and the number of questions', () => {
    expect(parseShown('3', 5)).toBe(3);
    expect(parseShown('9', 5)).toBe(5);
    expect(parseShown('0', 5)).toBe(1);
    expect(parseShown('x', 5)).toBe(1);
    expect(parseShown('4', 0)).toBe(1);
  });
  it('keeps the cooldown between zero and a week', () => {
    expect(parseCooldown('15')).toBe(15);
    expect(parseCooldown('-1')).toBe(0);
    expect(parseCooldown('99999')).toBe(10080);
    expect(parseCooldown('x')).toBe(0);
  });
});

describe('edits on the working copy', () => {
  const work = (): Working => {
    const course = makeCourse();
    const p = findQuiz(course, 'q1');
    if (!p) throw new Error('fixture');
    p.questions = [q({ id: 'k1' }), q({ id: 'k2' }), q({ id: 'k3' })];
    p.questionsShown = 3;
    return { course, answers: { q1: { k1: ['o1'], k2: ['o2'], k3: ['o3'] } } };
  };
  const ids = (w: Working) => findQuiz(w.course, 'q1')?.questions.map((x) => x.id);

  it('finds a Quiz by id and not a lesson', () => {
    expect(findQuiz(makeCourse(), 'q1')?.title).toBe('Quiz I');
    expect(findQuiz(makeCourse(), 'l1')).toBeNull();
  });

  it('updates a question and its key together, without mutating', () => {
    const w = work();
    const out = updateQuestion(w, 'q1', 'k2', (k) => ({
      question: { ...k.question, prompt: 'New' },
      key: ['o3'],
    }));
    expect(findQuiz(out.course, 'q1')?.questions[1]?.prompt).toBe('New');
    expect(out.answers.q1).toEqual({ k1: ['o1'], k2: ['o3'], k3: ['o3'] });
    expect(findQuiz(w.course, 'q1')?.questions[1]?.prompt).toBe('Which?');
    expect(w.answers.q1?.k2).toEqual(['o2']);
  });

  it('starts an empty key for a question that had none', () => {
    const w = work();
    w.answers = {};
    const out = updateQuestion(w, 'q1', 'k1', (k) => {
      expect(k.key).toEqual([]);
      return { ...k, key: ['o2'] };
    });
    expect(out.answers).toEqual({ q1: { k1: ['o2'] } });
  });

  it('changes nothing for an unknown Quiz or question', () => {
    const w = work();
    expect(updateQuestion(w, 'nope', 'k1', (k) => k)).toBe(w);
    expect(updateQuestion(w, 'q1', 'nope', (k) => k)).toBe(w);
  });

  it('adds a question with its key', () => {
    const made = newQuestion();
    const out = addQuestion(work(), 'q1', made);
    expect(ids(out)).toEqual(['k1', 'k2', 'k3', made.question.id]);
    expect(out.answers.q1?.[made.question.id]).toEqual(made.key);
  });

  it('removes a question and its key, and lowers questions shown', () => {
    const out = removeQuestion(work(), 'q1', 'k2');
    expect(ids(out)).toEqual(['k1', 'k3']);
    expect(out.answers.q1).toEqual({ k1: ['o1'], k3: ['o3'] });
    expect(findQuiz(out.course, 'q1')?.questionsShown).toBe(2);
  });

  it('keeps questions shown when it still fits, and at least one when none remain', () => {
    const w = work();
    updateQuiz(w, 'q1', (p) => ({ ...p, questionsShown: 1 }));
    const few = updateQuiz(w, 'q1', (p) => ({ ...p, questionsShown: 1 }));
    expect(findQuiz(removeQuestion(few, 'q1', 'k1').course, 'q1')?.questionsShown).toBe(1);
    let none = w;
    for (const id of ['k1', 'k2', 'k3']) none = removeQuestion(none, 'q1', id);
    expect(findQuiz(none.course, 'q1')?.questionsShown).toBe(1);
  });

  it('removes a key even when the Quiz had none stored', () => {
    const w = work();
    w.answers = {};
    expect(removeQuestion(w, 'q1', 'k1').answers).toEqual({ q1: {} });
  });

  it('reorders questions and keeps the keys attached to their ids', () => {
    const out = moveQuestion(work(), 'q1', 0, 2);
    expect(ids(out)).toEqual(['k2', 'k3', 'k1']);
    expect(out.answers.q1?.k1).toEqual(['o1']);
  });

  it('updates the Quiz settings', () => {
    const out = updateQuiz(work(), 'q1', (p) => ({ ...p, title: 'Final' }));
    expect(findQuiz(out.course, 'q1')?.title).toBe('Final');
  });
});
