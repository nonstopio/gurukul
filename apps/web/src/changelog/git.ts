import { execFileSync } from 'node:child_process';
import type { GitPort } from './releases';

/**
 * The real answers to `GitPort`, from the git CLI. Build-time only (run by
 * `scripts/changelog-releases.ts`); never imported by the app bundle.
 *
 * Every call degrades to "no answer" rather than throwing: a shallow CI clone or a
 * tarball without `.git` should build with everything marked unreleased, not fail.
 */
export function createGitPort(repoDir: string, entriesDir: string): GitPort {
  const git = (...args: string[]): string[] => {
    try {
      return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8', stdio: 'pipe' })
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  };
  return {
    // By name: release-YYYY.MM.DD-HHMM sorts chronologically as text, and unlike the tag date it
    // stays right when an older commit is redeployed.
    releaseTags: () => git('tag', '--list', 'release-*', '--sort=-refname'),
    addedIn: (file) =>
      git('log', '--diff-filter=A', '--format=%H', '-1', '--', `${entriesDir}/${file}`)[0] ?? null,
    tagsContaining: (commit) => git('tag', '--list', 'release-*', '--contains', commit),
  };
}
