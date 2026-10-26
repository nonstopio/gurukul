import { describe, expect, it } from 'vitest';
import {
  collectChanges,
  fileOf,
  filterChanges,
  groupChanges,
  type Change,
  type ChangelogEntry,
} from '../src/changelog';
import { readReleaseData, resolveReleases, type GitPort } from '../src/changelog/releases';

const entry = (over: Partial<ChangelogEntry> = {}): ChangelogEntry => ({
  date: '2026-10-27',
  id: 'GH-1',
  title: 'A title',
  area: 'LEARN',
  kind: 'feature',
  why: 'A reason',
  ...over,
});
const change = (
  file: string,
  release: string | null,
  over: Partial<ChangelogEntry> = {},
): Change => ({
  ...entry(over),
  file,
  release,
});

describe('fileOf', () => {
  it('keeps only the file name', () => {
    expect(fileOf('./entries/2026-10-27-010101-a.ts')).toBe('2026-10-27-010101-a.ts');
    expect(fileOf('plain.ts')).toBe('plain.ts');
  });
});

describe('collectChanges', () => {
  it('sorts newest file first and attaches releases, defaulting to unreleased', () => {
    const changes = collectChanges(
      {
        './entries/2026-10-26-090000-old.ts': { default: entry({ id: 'OLD' }) },
        './entries/2026-10-27-090000-new.ts': { default: entry({ id: 'NEW' }) },
      },
      { releases: ['release-1'], byFile: { '2026-10-26-090000-old.ts': 'release-1' } },
    );
    expect(changes.map((c) => [c.id, c.release])).toEqual([
      ['NEW', null],
      ['OLD', 'release-1'],
    ]);
  });
});

describe('filterChanges', () => {
  const all = [
    change('a', null, { id: 'A', area: 'LEARN', kind: 'fix', detail: ['Merge conflicts'] }),
    change('b', null, { id: 'B', area: 'STUDIO', kind: 'feature', detail: 'Prose about blocks' }),
    change('c', null, { id: 'C', area: 'STUDIO', kind: 'fix', deploy: 'Run the seed first' }),
  ];
  const ids = (q: string, area = '', kind = '') =>
    filterChanges(all, { query: q, area, kind }).map((c) => c.id);

  it('returns everything with no filter', () => expect(ids('')).toEqual(['A', 'B', 'C']));
  it('filters by area and kind', () => {
    expect(ids('', 'STUDIO')).toEqual(['B', 'C']);
    expect(ids('', '', 'fix')).toEqual(['A', 'C']);
    expect(ids('', 'STUDIO', 'fix')).toEqual(['C']);
  });
  it('searches detail arrays, detail prose, deploy notes and ids, ignoring case and spaces', () => {
    expect(ids('  MERGE ')).toEqual(['A']);
    expect(ids('blocks')).toEqual(['B']);
    expect(ids('seed')).toEqual(['C']);
    expect(ids('b')).toEqual(['B']);
    expect(ids('nothing like this')).toEqual([]);
  });
});

describe('groupChanges', () => {
  it('puts unreleased first, then releases in tag order, unknown releases last', () => {
    const groups = groupChanges(
      [
        change('1', 'release-old'),
        change('2', null),
        change('3', 'release-new'),
        change('4', 'release-old'),
        change('5', 'zz-unlisted'),
        change('6', 'aa-unlisted'),
      ],
      ['release-new', 'release-old'],
    );
    expect(groups.map((g) => [g.label, g.unreleased, g.items.length])).toEqual([
      ['Unreleased', true, 1],
      ['release-new', false, 1],
      ['release-old', false, 2],
      ['zz-unlisted', false, 1],
      ['aa-unlisted', false, 1],
    ]);
  });

  it('returns no groups for no changes', () => {
    expect(groupChanges([], [])).toEqual([]);
  });
});

describe('resolveReleases', () => {
  const git: GitPort = {
    releaseTags: () => ['release-3', 'release-2', 'release-1'],
    addedIn: (file) => ({ 'old.ts': 'c1', 'mid.ts': 'c2', 'new.ts': 'c3' })[file] ?? null,
    tagsContaining: (commit) =>
      ({ c1: ['release-1', 'release-2', 'release-3', 'other-tag'], c2: ['release-3'] })[commit] ??
      [],
  };
  const files = ['old.ts', 'mid.ts', 'new.ts', 'uncommitted.ts'];

  it('files each entry under the oldest release that contains it', () => {
    expect(resolveReleases(files, git)).toEqual({
      releases: ['release-3', 'release-2', 'release-1'],
      byFile: {
        'old.ts': 'release-1',
        'mid.ts': 'release-3',
        'new.ts': null,
        'uncommitted.ts': null,
      },
    });
  });

  it('files untagged entries under the release this build is cutting', () => {
    const data = resolveReleases(files, git, 'release-4');
    expect(data.releases[0]).toBe('release-4');
    expect(data.byFile['new.ts']).toBe('release-4');
    expect(data.byFile['uncommitted.ts']).toBe('release-4');
    expect(data.byFile['old.ts']).toBe('release-1');
  });
});

describe('readReleaseData', () => {
  it('reads the generated file when the build made one', () => {
    const data = { releases: ['release-1'], byFile: { 'a.ts': 'release-1' } };
    expect(readReleaseData({ './releases.generated.json': { default: data } })).toBe(data);
  });

  it('treats a missing file as nothing released yet', () => {
    expect(readReleaseData({})).toEqual({ releases: [], byFile: {} });
  });
});
