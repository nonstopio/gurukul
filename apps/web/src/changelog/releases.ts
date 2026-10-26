/**
 * Which release shipped each entry — derived from git, never typed by hand.
 *
 * A release is a `release-*` tag that `deploy.yml` pushes after a successful production deploy.
 * An entry belongs to the OLDEST release tag that contains the commit which added its file.
 * Anything not in a tag yet is unreleased, unless this very build is the release being cut
 * (`pendingRelease`), in which case it belongs to that one.
 */

/** The three questions asked of git. `git.ts` answers them for real; tests answer them directly. */
export interface GitPort {
  /** Release tags, newest first. */
  releaseTags(): string[];
  /** The commit that added this entry file, or null if it is not committed yet. */
  addedIn(file: string): string | null;
  /** Every tag whose history includes this commit. */
  tagsContaining(commit: string): string[];
}

export interface ReleaseData {
  /** Release names, newest first, including the pending one when a release is being cut. */
  releases: string[];
  /** Entry file name → release, or null while unreleased. */
  byFile: Record<string, string | null>;
}

export function resolveReleases(
  files: readonly string[],
  git: GitPort,
  pendingRelease?: string,
): ReleaseData {
  const tags = git.releaseTags();
  const byFile: Record<string, string | null> = {};
  for (const file of files) {
    const commit = git.addedIn(file);
    const containing = commit ? new Set(git.tagsContaining(commit)) : new Set<string>();
    // `tags` is newest first, so the last match is the oldest release that has it.
    const shippedIn = tags.filter((tag) => containing.has(tag)).at(-1);
    byFile[file] = shippedIn ?? pendingRelease ?? null;
  }
  return { releases: pendingRelease ? [pendingRelease, ...tags] : tags, byFile };
}

/** Reads the generated file if the build produced one; an absent file means "nothing released". */
export function readReleaseData(generated: Record<string, { default: ReleaseData }>): ReleaseData {
  const data = Object.values(generated)[0]?.default;
  return data ?? { releases: [], byFile: {} };
}
