import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const REPO = path.resolve(import.meta.dirname, '../..');
export const SCRIPTS = path.join(REPO, 'scripts');

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_NOSYSTEM: '1',
  HOME: tmpdir(),
};

export function tempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), `gurukul-${prefix}-`));
}

export function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
}

/** A git repository with the given files written (not committed). */
export function gitRepo(files = {}) {
  const dir = tempDir('repo');
  git(dir, 'init', '-q', '-b', 'main');
  writeFiles(dir, files);
  return dir;
}

export function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  }
}

export function commitAll(dir, message) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--no-verify', '-m', message);
  return git(dir, 'rev-parse', 'HEAD').trim();
}

/** Run a shell script from scripts/ in `cwd`, optionally feeding stdin. */
export function sh(script, { cwd, args = [], input, env = {} } = {}) {
  return spawnSync('sh', [path.join(SCRIPTS, script), ...args], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV, ...env },
  });
}

export const entry = (date, extra = '') =>
  `import type { ChangelogEntry } from '../types';\n\nexport default {\n  date: '${date}',${extra}\n} satisfies ChangelogEntry;\n`;
