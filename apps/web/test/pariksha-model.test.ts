import { describe, expect, it } from 'vitest';
import type { Pariksha } from '@gurukul/schema';
import {
  cooldownRemaining,
  formatWait,
  itemAfter,
  itemPath,
  linkedInUrl,
  longDate,
  pickQuestions,
  shuffle,
} from '../src/pariksha/model';
import { makeCourse } from './fake-data';

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
const pariksha = (over: Partial<Pariksha> = {}): Pariksha => ({
  type: 'pariksha',
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
    const picked = pickQuestions(pariksha(), () => 0);
    expect(picked).toHaveLength(2);
    expect(new Set(picked.map((x) => x.id)).size).toBe(2);
  });
  it('shows the whole pool, in order, when it is no larger than questionsShown', () => {
    expect(pickQuestions(pariksha({ questionsShown: 4 })).map((x) => x.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
  });
  it('shuffles options only when asked, without touching the course', () => {
    const p = pariksha({ shuffleOptions: true, questionsShown: 4 });
    const out = pickQuestions(p, () => 0);
    expect(out[0]?.options.map((o) => o.id)).toEqual(['b', 'c', 'a']);
    expect(p.questions[0]?.options.map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(
      pickQuestions(pariksha({ questionsShown: 4 }), () => 0)[0]?.options.map((o) => o.id),
    ).toEqual(['a', 'b', 'c']);
  });
  it('defaults to Math.random', () => {
    expect(pickQuestions(pariksha())).toHaveLength(2);
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
    expect(itemPath('git', { id: 'q1', type: 'pariksha' })).toBe('/courses/git/pariksha/q1');
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
