import assert from 'node:assert/strict';
import {
  accessSync,
  chmodSync,
  constants,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { commitAll, git, gitRepo, sh, tempDir, writeFiles } from './helpers.mjs';

const ZERO = '0'.repeat(40);
const TOOLS = ['sh', 'git', 'grep', 'sort', 'dirname'];

/** Where `tool` lives on this machine's PATH, found without running a shell. */
function which(tool) {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, tool);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // not in this directory
    }
  }
  throw new Error(`${tool} is not on PATH`);
}

/** Logs each call to $NPM_LOG and fails the one whose arguments contain $NPM_FAIL. */
const FAKE_NPM = `#!/bin/sh
echo "$*" >> "$NPM_LOG"
[ -n "\${NPM_FAIL:-}" ] && echo "$*" | grep -q -- "$NPM_FAIL" && exit 1
exit 0
`;

/**
 * A PATH holding a fake `npm` that logs each call (and fails the one named in NPM_FAIL), the
 * tools the hook needs, and `java` only when asked: the real one may be on the machine's PATH.
 */
function fakePath({ java }) {
  const bin = tempDir('bin');
  const log = path.join(bin, 'npm.log');
  writeFileSync(path.join(bin, 'npm'), FAKE_NPM);
  chmodSync(path.join(bin, 'npm'), 0o755);
  for (const tool of java ? [...TOOLS, 'java'] : TOOLS)
    symlinkSync(which(tool), path.join(bin, tool));
  return { bin, log, calls: () => readFileSync(log, 'utf8').trim().split('\n') };
}

/** Push a new branch that adds `files`; returns the hook's result and the npm calls it made. */
function push(files, { java = true, fail } = {}) {
  const remote = tempDir('remote');
  git(remote, 'init', '-q', '--bare');
  const dir = gitRepo({ 'README.md': '1' });
  commitAll(dir, 'base');
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-q', 'origin', 'main');
  git(dir, 'checkout', '-q', '-b', 'feat');
  writeFiles(dir, files);
  const sha = commitAll(dir, 'change');
  const { bin, log, calls } = fakePath({ java });
  const res = sh('pre-push.sh', {
    cwd: dir,
    input: `refs/heads/feat ${sha} refs/heads/feat ${ZERO}\n`,
    env: { PATH: bin, NPM_LOG: log, ...(fail ? { NPM_FAIL: fail } : {}) },
  });
  return { res, calls: calls() };
}

describe('pre-push.sh', () => {
  it('runs only the cheap checks for a docs-only push', () => {
    const { res, calls } = push({ '.plan/notes.md': 'x' });
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(calls, ['run -s typecheck', 'run -s validate:navigation -- --quiet']);
  });

  it('runs coverage, the bundle budget and the end-to-end specs for an app change', () => {
    const { res, calls } = push({ 'apps/web/src/Page.tsx': 'x' });
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(calls.slice(2), [
      'run -s coverage -w @gurukul/web',
      'run -s build -w @gurukul/web',
      'run -s check:bundle',
      'run -s e2e',
    ]);
  });

  it('runs the rules tests and the end-to-end specs for a rules change', () => {
    const { res, calls } = push({ 'firebase/firestore.rules': 'x' });
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(calls.slice(2), ['run -s test:rules', 'run -s e2e']);
  });

  it('runs the end-to-end specs, but no bundle check, for a functions change', () => {
    const { res, calls } = push({ 'firebase/functions/src/remind.ts': 'x' });
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(calls.slice(2), ['run -s coverage -w @gurukul/functions', 'run -s e2e']);
  });

  it('refuses, rather than skips, an emulator push when Java is missing', () => {
    const { res, calls } = push({ 'e2e/tests/learner.spec.ts': 'x' }, { java: false });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Java 21/);
    assert.ok(!calls.includes('run -s e2e'));
  });

  it('refuses the push and says how to reproduce a failing step', () => {
    for (const [step, reproduce] of [
      ['e2e', 'npm run e2e'],
      ['check:bundle', 'npm run check:bundle'],
      ['test:rules', 'npm run test:rules'],
    ]) {
      const { res } = push(
        { 'apps/web/src/Page.tsx': 'x', 'firebase/rules/test.ts': 'x' },
        { fail: step },
      );
      assert.equal(res.status, 1, step);
      assert.ok(res.stderr.includes(reproduce), `${step}: ${res.stderr}`);
    }
  });
});
