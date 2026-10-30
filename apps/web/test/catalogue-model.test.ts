import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUERY,
  applyQuery,
  isFiltered,
  openable,
  parseQuery,
  queryParams,
} from '../src/learn/catalogue';
import { minutesLeft, suggestions } from '../src/learn/hero';
import { makeCourse, progressRow } from './fake-data';

const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const a = makeCourse({
  id: 'a',
  title: 'Alpha',
  summary: 'Git things',
  estimatedMinutes: 30,
  publishedAt: ts(1),
});
const b = makeCourse({
  id: 'b',
  title: 'Beta',
  summary: 'SQL',
  level: 'advanced',
  estimatedMinutes: 10,
  publishedAt: ts(5),
});
const none = { assignedIds: new Set<string>(), progress: [] };

describe('catalogue query in the URL', () => {
  it('round-trips, leaving defaults out of the URL', () => {
    expect(queryParams(DEFAULT_QUERY).toString()).toBe('');
    const q = { q: 'git', view: 'completed', level: 'advanced', sort: 'title' } as const;
    expect(queryParams(q).toString()).toBe('q=git&show=completed&level=advanced&sort=title');
    expect(parseQuery(queryParams(q))).toEqual(q);
  });
  it('falls back to defaults for anything unknown', () => {
    expect(parseQuery(new URLSearchParams('show=x&level=y&sort=z'))).toEqual(DEFAULT_QUERY);
  });
  it('says whether a filter is on; the sort alone is not one', () => {
    expect(isFiltered(DEFAULT_QUERY)).toBe(false);
    expect(isFiltered({ ...DEFAULT_QUERY, sort: 'title' })).toBe(false);
    expect(isFiltered({ ...DEFAULT_QUERY, level: 'advanced' })).toBe(true);
  });
});

describe('applyQuery', () => {
  it('sorts newest first, by title and by length', () => {
    expect(applyQuery([a, b], DEFAULT_QUERY, none).map((c) => c.id)).toEqual(['b', 'a']);
    expect(applyQuery([b, a], { ...DEFAULT_QUERY, sort: 'title' }, none).map((c) => c.id)).toEqual([
      'a',
      'b',
    ]);
    expect(applyQuery([a, b], { ...DEFAULT_QUERY, sort: 'time' }, none).map((c) => c.id)).toEqual([
      'b',
      'a',
    ]);
  });
  it('searches the title and the summary, ignoring case', () => {
    expect(applyQuery([a, b], { ...DEFAULT_QUERY, q: ' ALPHA ' }, none)).toEqual([a]);
    expect(applyQuery([a, b], { ...DEFAULT_QUERY, q: 'sql' }, none)).toEqual([b]);
  });
  it('filters by level and by view', () => {
    expect(applyQuery([a, b], { ...DEFAULT_QUERY, level: 'advanced' }, none)).toEqual([b]);
    const mine = {
      assignedIds: new Set(['a']),
      progress: [
        progressRow({ courseId: 'a', completedAt: null }),
        progressRow({ courseId: 'b', completedAt: new Date() }),
      ],
    };
    expect(applyQuery([a, b], { ...DEFAULT_QUERY, view: 'assigned' }, mine)).toEqual([a]);
    expect(applyQuery([a, b], { ...DEFAULT_QUERY, view: 'progress' }, mine)).toEqual([a]);
    expect(applyQuery([a, b], { ...DEFAULT_QUERY, view: 'completed' }, mine)).toEqual([b]);
    expect(applyQuery([a, b], { ...DEFAULT_QUERY, view: 'progress' }, none)).toEqual([]);
  });
  it('keeps only what the person may open, as the rules do', () => {
    const team = { ...a, visibility: 'teams' as const, visibleTeamIds: ['qa'] };
    expect(openable([team, b], { teamIds: [], staff: false })).toEqual([b]);
    expect(openable([team, b], { teamIds: ['qa'], staff: false })).toEqual([team, b]);
  });
});

describe('home hero helpers', () => {
  it('counts the lesson minutes still to do', () => {
    const c = makeCourse();
    expect(minutesLeft(c, progressRow({ completedItemIds: ['l1'] }))).toBe(15);
    expect(minutesLeft(c, progressRow({ completedItemIds: ['l1', 'l2', 'l3', 'l4'] }))).toBe(0);
  });
  it('suggests up to three unstarted published courses, assigned ones first', () => {
    const cs = ['a', 'b', 'c', 'd', 'e'].map((id) => makeCourse({ id }));
    const retired = makeCourse({ id: 'r', status: 'archived' });
    const assigned = [
      {
        assignment: {
          id: 'x',
          courseId: 'd',
          dueAt: null,
          mandatory: true,
          status: 'assigned' as const,
          assignedByName: null,
        },
        course: cs[3] as (typeof cs)[number],
        progress: null,
      },
    ];
    const picks = suggestions([...cs, retired], assigned, [progressRow({ courseId: 'a' })]);
    expect(picks.map((c) => c.id)).toEqual(['d', 'b', 'c']);
    expect(suggestions([], [], [])).toEqual([]);
  });
});
