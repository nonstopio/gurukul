// Test helpers: spawn a hook with a payload, and build throwaway git repositories to point it at.
// Run the suite with `node --test .claude/hooks/test/`.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A fresh empty directory, realpath'd so macOS /var vs /private/var never matters. */
export function tempDir(prefix = 'gurukul-hooks-') {
  return realpathSync(mkdtempSync(path.join(os.tmpdir(), prefix)));
}

/**
 * Runs a hook. `payload` is JSON-encoded unless it is already a string (to test garbage input).
 * `tmp` becomes TMPDIR, so once-per-session markers are isolated per test.
 */
export function runHook(name, payload, { tmp = tempDir(), cwd } = {}) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const res = spawnSync(process.execPath, [path.join(HOOKS, `${name}.mjs`)], {
    input,
    cwd,
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp },
  });
  const out = res.stdout.trim();
  return {
    status: res.status,
    stdout: out,
    stderr: res.stderr,
    json: out ? JSON.parse(out) : null,
  };
}

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Hook Test',
  GIT_AUTHOR_EMAIL: 'hook-test@example.com',
  GIT_COMMITTER_NAME: 'Hook Test',
  GIT_COMMITTER_EMAIL: 'hook-test@example.com',
  GIT_CONFIG_NOSYSTEM: '1',
  HOME: os.tmpdir(),
};

export function git(repo, ...args) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Writes `files` ({ 'rel/path': 'content' }) under `root`. */
export function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

/** A git repository with `files` committed, so `git status` starts clean. */
export function fixtureRepo(files) {
  const repo = tempDir('gurukul-repo-');
  git(repo, 'init', '-q', '-b', 'main');
  writeFiles(repo, files);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'chore(test): fixture');
  return repo;
}

/** A PostToolUse payload for an edit of `file`. */
export function editPayload(file, session = 'session-a', tool = 'Edit') {
  return {
    session_id: session,
    hook_event_name: 'PostToolUse',
    tool_name: tool,
    tool_input: { file_path: file, old_string: 'a', new_string: 'b' },
  };
}

export function context(result) {
  return result.json?.hookSpecificOutput?.additionalContext ?? null;
}

export function decision(result) {
  return result.json?.hookSpecificOutput ?? null;
}
