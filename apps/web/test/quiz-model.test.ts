import { describe, expect, it } from 'vitest';
import type { Quiz } from '@gurukul/schema';
import {
  answerLetters,
  cooldownRemaining,
  drawOrder,
  isDraft,
  restoreQuestions,
  sameAnswer,
  formatCountdown,
  formatWait,
  chapterNumber,
  reviewOfAttempt,
  itemAfter,
  itemPath,
  linkedInUrl,
  longDate,
  pickQuestions,
  shuffle,
} from '../src/quiz/model';
import { attemptRow, makeCourse } from './fake-data';

const q = (id: string) => ({
  id,
  kind: 'single' as const,
  prompt: id,
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'c', text: 'C' },
  ],
  explanation: '',
});
const quiz = (over: Partial<Quiz> = {}): Quiz => ({
  type: 'quiz',
  id: 'p',
  title: 'P',
  questionsShown: 2,
  shuffleOptions: false,
  cooldownMinutes: 10,
  revealAnswers: 'each',
  blocksNext: true,
  questions: ['1', '2', '3', '4'].map(q),
  ...over,
});
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] as number;
};

describe('shuffle', () => {
  it('permutes a copy deterministically and leaves the input alone', () => {
    const input = [1, 2, 3, 4];
    expect(shuffle(input, () => 0)).toEqual([2, 3, 4, 1]);
    expect(input).toEqual([1, 2, 3, 4]);
    expect(shuffle(input, () => 0.99)).toEqual([1, 2, 3, 4]);
    expect(shuffle([], () => 0)).toEqual([]);
  });
  it('defaults to Math.random', () => {
    expect(shuffle([1, 2, 3]).sort()).toEqual([1, 2, 3]);
  });
});

describe('pickQuestions', () => {
  it('draws questionsShown from a larger pool', () => {
    const picked = pickQuestions(quiz(), () => 0);
    expect(picked).toHaveLength(2);
    expect(new Set(picked.map((x) => x.id)).size).toBe(2);
  });
  it('shows the whole pool, in order, when it is no larger than questionsShown', () => {
    expect(pickQuestions(quiz({ questionsShown: 4 })).map((x) => x.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
  });
  it('shuffles options only when asked, without touching the course', () => {
    const p = quiz({ shuffleOptions: true, questionsShown: 4 });
    const out = pickQuestions(p, () => 0);
    expect(out[0]?.options.map((o) => o.id)).toEqual(['b', 'c', 'a']);
    expect(p.questions[0]?.options.map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(
      pickQuestions(quiz({ questionsShown: 4 }), () => 0)[0]?.options.map((o) => o.id),
    ).toEqual(['a', 'b', 'c']);
  });
  it('defaults to Math.random', () => {
    expect(pickQuestions(quiz())).toHaveLength(2);
    expect(seq(0.5)()).toBe(0.5);
  });
});

describe('cooldown', () => {
  const now = new Date('2026-03-01T10:10:00Z');
  it('is zero without an attempt or once the cooldown has passed', () => {
    expect(cooldownRemaining(null, 10, now)).toBe(0);
    expect(cooldownRemaining(new Date('2026-03-01T09:00:00Z'), 10, now)).toBe(0);
    expect(cooldownRemaining(new Date('2026-03-01T10:00:00Z'), 0, now)).toBe(0);
  });
  it('counts what is left', () => {
    expect(cooldownRemaining(new Date('2026-03-01T10:05:00Z'), 10, now)).toBe(5 * 60_000);
  });
  it('words the wait', () => {
    expect(formatWait(6 * 60_000)).toBe('6 minutes');
    expect(formatWait(60_000)).toBe('1 minute');
    expect(formatWait(61_000)).toBe('2 minutes');
    expect(formatWait(0)).toBe('less than a minute');
    expect(formatWait(-5)).toBe('less than a minute');
  });
});

describe('items and links', () => {
  const course = makeCourse();
  it('finds the next item and where to open it', () => {
    expect(itemAfter(course, 'l1')?.id).toBe('l2');
    expect(itemAfter(course, 'l4')).toBeUndefined();
    expect(itemPath('git', { id: 'l1', type: 'lesson' })).toBe('/courses/git/learn/l1');
    expect(itemPath('git', { id: 'q1', type: 'quiz' })).toBe('/courses/git/quiz/q1');
  });

  it('builds the LinkedIn certification link', () => {
    const url = new URL(
      linkedInUrl({
        title: 'Git, the NonStop Way',
        credentialId: 'NSG-GIT-26-0001',
        verifyUrl: 'https://academy.example/verify/NSG-GIT-26-0001',
        issuedAt: new Date('2026-11-09T00:00:00Z'),
      }),
    );
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/profile/add');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      name: 'Git, the NonStop Way',
      organizationName: 'NonStop io',
      issueYear: '2026',
      issueMonth: '11',
      certId: 'NSG-GIT-26-0001',
    });
  });

  it('formats a long date in UTC', () => {
    expect(longDate(new Date('2026-11-09T23:30:00Z'))).toBe('9 November 2026');
  });
});

describe('drafts', () => {
  it('records a draw by id and restores it with the options in the saved order', () => {
    const p = quiz();
    const order = drawOrder([{ ...q('2'), options: [...q('2').options].reverse() }, q('1')]);
    expect(order).toEqual([
      { id: '2', optionIds: ['c', 'b', 'a'] },
      { id: '1', optionIds: ['a', 'b', 'c'] },
    ]);
    const restored = restoreQuestions(p, order);
    expect(restored?.map((x) => x.id)).toEqual(['2', '1']);
    expect(restored?.[0]?.options.map((o) => o.text)).toEqual(['C', 'B', 'A']);
  });

  it('gives up on a draw the Quiz no longer matches', () => {
    const p = quiz();
    expect(restoreQuestions(p, [])).toBeNull();
    expect(restoreQuestions(p, [{ id: 'gone', optionIds: ['a', 'b', 'c'] }])).toBeNull();
    expect(restoreQuestions(p, [{ id: '1', optionIds: ['a', 'b'] }])).toBeNull();
    expect(restoreQuestions(p, [{ id: '1', optionIds: ['a', 'b', 'z'] }])).toBeNull();
  });

  it('recognises the shape of a draft', () => {
    const draft = { startedAt: 1, order: [], index: 0, answers: {}, feedback: {} };
    expect(isDraft(draft)).toBe(true);
    expect(isDraft(null)).toBe(false);
    expect(isDraft({ ...draft, answers: [] })).toBe(false);
    expect(isDraft({ ...draft, feedback: null })).toBe(false);
    expect(isDraft({ ...draft, index: '0' })).toBe(false);
  });

  it('compares answers regardless of order', () => {
    expect(sameAnswer(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameAnswer(['a'], ['a', 'b'])).toBe(false);
    expect(sameAnswer(['a'], ['b'])).toBe(false);
  });

  it('names the right options by their letters as shown', () => {
    expect(answerLetters(['a', 'b', 'c'], ['b'])).toBe('B');
    expect(answerLetters(['a', 'b', 'c', 'd'], ['d', 'a', 'b'])).toBe('A, B and D');
    expect(answerLetters(['a', 'b', 'c', 'd', 'e'], ['e'])).toBe('E');
    expect(answerLetters(['a'], ['z'])).toBe('');
  });
});

describe('formatCountdown', () => {
  it('shows minutes and seconds, hours from an hour up, and never goes below zero', () => {
    expect(formatCountdown(61_500)).toBe('1:02');
    expect(formatCountdown(9_000)).toBe('0:09');
    expect(formatCountdown(3_723_000)).toBe('1:02:03');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});

describe('chapterNumber', () => {
  it('numbers chapters from one, and gives 0 for an item no chapter holds', () => {
    expect(chapterNumber(makeCourse(), 'l1')).toBe(1);
    expect(chapterNumber(makeCourse(), 'q1')).toBe(2);
    expect(chapterNumber(makeCourse(), 'nope')).toBe(0);
  });
});

describe('reviewOfAttempt', () => {
  const attempt = attemptRow({
    passed: false,
    questionIds: ['2', 'gone', '1'],
    results: [
      { questionId: '2', correct: true },
      { questionId: 'gone', correct: false },
      { questionId: '1', correct: false },
    ],
  });
  const withExplanations = quiz({
    questions: ['1', '2'].map((id) => ({ ...q(id), explanation: `Why ${id}` })),
  });

  it('takes the questions from the course in the order drawn, leaving out removed ones', () => {
    const review = reviewOfAttempt(withExplanations, attempt);
    expect(review.questions.map((x) => x.id)).toEqual(['2', '1']);
    expect(review.results.map((r) => r.explanation)).toEqual(['Why 2', undefined, 'Why 1']);
    expect(review).toMatchObject({ score: 1, correctCount: 1, total: 1, passed: false });
  });

  it('reveals explanations as grading would, and skips an empty one', () => {
    const onPass = { ...withExplanations, revealAnswers: 'onPass' as const };
    expect(reviewOfAttempt(onPass, attempt).results.some((r) => r.explanation)).toBe(false);
    expect(
      reviewOfAttempt(onPass, { ...attempt, passed: true }).results.map((r) => r.explanation),
    ).toEqual(['Why 2', undefined, 'Why 1']);
    const never = { ...withExplanations, revealAnswers: 'never' as const };
    expect(reviewOfAttempt(never, attempt).results.some((r) => r.explanation)).toBe(false);
    expect(reviewOfAttempt(quiz(), attempt).results.some((r) => r.explanation)).toBe(false);
  });
});
