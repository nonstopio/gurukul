#!/usr/bin/env node
// The next Gurukul Studio version, for .github/workflows/desktop-release.yml. Nobody types a
// version: git tags are the version (`desktop-vMAJOR.MINOR.PATCH`), and the bump comes from the
// subjects and bodies of the commits since the last such tag that touched apps/desktop/
// (.plan/22-desktop-studio.md, "Versions: nobody types one"):
//
//   - a `!` after the type (`feat(desktop)!:`) or a `BREAKING CHANGE:` line → major;
//   - `feat` → minor;
//   - anything else → patch.
//
// With no `desktop-v*` tag yet, the first release is 0.1.0 whatever the commits say: the plan's
// first version, not a bump of 0.0.0 (which a `fix` alone would make 0.0.1).
//
// A release is due only when apps/desktop/ changed since the last tag (always, with no tag).
//
// Usage: node scripts/desktop-version.mjs [repo dir]. Writes `release`, `version`, `tag` and
// `previous` to $GITHUB_OUTPUT when it is set, and prints them either way.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TAG_PREFIX = 'desktop-v';
export const FIRST_VERSION = '0.1.0';
export const DESKTOP_PATH = 'apps/desktop/';

const MAJOR = /^(BREAKING CHANGE:|[a-z]+(\([^)]*\))?!:)/m;
const MINOR = /^feat(\([^)]*\))?:/m;

/** `major`, `minor` or `patch`, from commit subjects and bodies joined by newlines. */
export function bumpOf(log) {
  if (MAJOR.test(log)) return 'major';
  if (MINOR.test(log)) return 'minor';
  return 'patch';
}

/** The version after `lastTag` (`desktop-v1.2.3`, or null for none) given the commit log. */
export function nextVersion(lastTag, log) {
  if (lastTag === null) return FIRST_VERSION;
  const match = /^desktop-v(\d+)\.(\d+)\.(\d+)$/.exec(lastTag);
  if (match === null) throw new Error(`Not a desktop tag: ${lastTag}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  switch (bumpOf(log)) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** The newest `desktop-v*` tag reachable from HEAD, or null. */
export function lastDesktopTag(cwd) {
  try {
    return git(cwd, 'describe', '--tags', '--abbrev=0', '--match', `${TAG_PREFIX}*`).trim();
  } catch {
    return null;
  }
}

/** What the release workflow needs to know about HEAD. */
export function plan(cwd) {
  const previous = lastDesktopTag(cwd);
  const range = previous === null ? ['HEAD'] : [`${previous}..HEAD`];
  const log = git(cwd, 'log', ...range, '--no-merges', '--format=%s%n%b', '--', DESKTOP_PATH);
  const release = log.trim() !== '';
  const version = nextVersion(previous, log);
  return { release, version, tag: `${TAG_PREFIX}${version}`, previous: previous ?? '' };
}

function main() {
  const result = plan(process.argv[2] ?? process.cwd());
  const lines = Object.entries(result).map(([key, value]) => `${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
