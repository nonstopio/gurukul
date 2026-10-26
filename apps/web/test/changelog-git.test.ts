// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGitPort } from '../src/changelog/git';
import { resolveReleases } from '../src/changelog/releases';

/** A throwaway repository: entry a in release-1, b in release-2, c committed but untagged. */
let repo: string;

function git(args: string[], date: string) {
  execFileSync('git', args, {
    cwd: repo,
    stdio: 'pipe',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}
function add(file: string, date: string) {
  writeFileSync(join(repo, 'entries', file), 'export default {};\n');
  git(['add', '.'], date);
  git(['commit', '-q', '-m', file], date);
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'gurukul-changelog-'));
  mkdirSync(join(repo, 'entries'));
  git(['init', '-q'], '2026-01-01T00:00:00Z');
  add('a.ts', '2026-01-01T00:00:00Z');
  git(['tag', 'release-1'], '2026-01-01T00:00:00Z');
  add('b.ts', '2026-02-01T00:00:00Z');
  git(['tag', 'release-2'], '2026-02-01T00:00:00Z');
  git(['tag', 'not-a-release'], '2026-02-01T00:00:00Z');
  add('c.ts', '2026-03-01T00:00:00Z');
  // An older commit redeployed later: its tag carries the OLD commit's date, so ordering by tag
  // date would misplace it. Ordering by name keeps it newest.
  git(['tag', 'release-3', 'HEAD~2'], '2026-04-01T00:00:00Z');
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('createGitPort', () => {
  it('reads release tags newest first, ignoring other tags', () => {
    expect(createGitPort(repo, 'entries').releaseTags()).toEqual([
      'release-3',
      'release-2',
      'release-1',
    ]);
  });

  it('derives each entry release from real git history', () => {
    const port = createGitPort(repo, 'entries');
    expect(resolveReleases(['a.ts', 'b.ts', 'c.ts', 'missing.ts'], port).byFile).toEqual({
      'a.ts': 'release-1',
      'b.ts': 'release-2',
      'c.ts': null,
      'missing.ts': null,
    });
  });

  it('answers nothing, rather than throwing, outside a git repository', () => {
    const notRepo = mkdtempSync(join(tmpdir(), 'gurukul-not-a-repo-'));
    const port = createGitPort(notRepo, 'entries');
    expect(port.releaseTags()).toEqual([]);
    expect(port.addedIn('a.ts')).toBeNull();
    expect(port.tagsContaining('abc')).toEqual([]);
    rmSync(notRepo, { recursive: true, force: true });
  });
});
