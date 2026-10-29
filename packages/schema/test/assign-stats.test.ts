import { describe, expect, it } from 'vitest';
import {
  classifyEmails,
  courseStatsSchema,
  FINISH_DAYS_CAP,
  finishDaysBucket,
  isoWeek,
  lastWeeks,
  orgStatsSchema,
  parseCsvEmails,
  parseEmailList,
  summarize,
} from '../src';

describe('parseEmailList', () => {
  it('splits on commas, semicolons, spaces and new lines, and unquotes', () => {
    expect(parseEmailList('a@x.io, b@x.io;c@x.io\n"d@x.io" <e@x.io>  ,,')).toEqual([
      'a@x.io',
      'b@x.io',
      'c@x.io',
      'd@x.io',
      'e@x.io',
    ]);
    expect(parseEmailList('  \n ')).toEqual([]);
  });
});

describe('parseCsvEmails', () => {
  it('reads the first column, skipping a header and blank lines', () => {
    expect(parseCsvEmails('email,name\na@nonstopio.com,A\n\n"b@nonstopio.com",B\r\n')).toEqual([
      'a@nonstopio.com',
      'b@nonstopio.com',
    ]);
  });
  it('works without a header, and for an empty file', () => {
    expect(parseCsvEmails('a@nonstopio.com\nb@nonstopio.com')).toEqual([
      'a@nonstopio.com',
      'b@nonstopio.com',
    ]);
    expect(parseCsvEmails('')).toEqual([]);
    expect(parseCsvEmails('email')).toEqual([]);
  });
});

describe('classifyEmails and summarize', () => {
  const known = {
    signedIn: new Set(['priya@nonstopio.com', 'done@nonstopio.com']),
    assigned: new Set(['done@nonstopio.com']),
  };
  const classified = classifyEmails(
    [
      ' Priya@NonStopIO.com ',
      'new@nonstopio.com',
      'priya@nonstopio.com',
      'done@nonstopio.com',
      'bad',
      'x@gmail.com',
      '',
    ],
    known,
  );

  it('normalises, dedupes and classifies in first-seen order', () => {
    expect(classified).toEqual([
      { email: 'priya@nonstopio.com', status: 'signedIn' },
      { email: 'new@nonstopio.com', status: 'new' },
      { email: 'done@nonstopio.com', status: 'alreadyAssigned' },
      { email: 'bad', status: 'rejected', reason: 'Not a valid email address' },
      { email: 'x@gmail.com', status: 'rejected', reason: 'Not an @nonstopio.com address' },
    ]);
  });

  it('honours another domain', () => {
    expect(classifyEmails(['a@example.com'], known, 'example.com')[0]?.status).toBe('new');
  });

  it('summarises for the preview and the response', () => {
    expect(summarize(classified)).toEqual({
      signedIn: 1,
      newInvites: 1,
      alreadyAssigned: 1,
      rejected: [
        { email: 'bad', reason: 'Not a valid email address' },
        { email: 'x@gmail.com', reason: 'Not an @nonstopio.com address' },
      ],
    });
    expect(summarize([{ email: 'e', status: 'rejected' }]).rejected[0]?.reason).toBe('');
  });
});

describe('stats', () => {
  it('buckets a finish time into whole days, never negative, capped', () => {
    expect(finishDaysBucket(2.4)).toBe('2');
    expect(finishDaysBucket(2.5)).toBe('3');
    expect(finishDaysBucket(-1)).toBe('0');
    expect(finishDaysBucket(10_000)).toBe(String(FINISH_DAYS_CAP));
    expect(courseStatsSchema.parse({}).finishDaysHistogram).toEqual({});
  });

  it('fills defaults so an empty document parses', () => {
    expect(orgStatsSchema.parse({})).toMatchObject({
      started: 0,
      weekly: {},
      activeLearners30d: 0,
      quizScoreSum: 0,
      quizFirstTryPassed: 0,
    });
    expect(courseStatsSchema.parse({})).toMatchObject({
      assigned: 0,
      chapterCompletions: [],
      questionFirstTry: {},
    });
    expect(courseStatsSchema.safeParse({ assigned: -1 }).success).toBe(false);
  });

  it('names ISO weeks, including year boundaries', () => {
    expect(isoWeek(new Date('2026-10-27T10:00:00Z'))).toBe('2026-W44');
    expect(isoWeek(new Date('2026-01-01T00:00:00Z'))).toBe('2026-W01');
    expect(isoWeek(new Date('2021-01-03T00:00:00Z'))).toBe('2020-W53');
    expect(isoWeek(new Date('2024-12-30T00:00:00Z'))).toBe('2025-W01');
  });

  it('lists the last n weeks oldest first', () => {
    expect(lastWeeks(new Date('2026-10-27T00:00:00Z'), 3)).toEqual([
      '2026-W42',
      '2026-W43',
      '2026-W44',
    ]);
  });
});
