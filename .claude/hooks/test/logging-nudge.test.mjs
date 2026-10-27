import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { context, editPayload, fixtureRepo, runHook, tempDir, writeFiles } from './helpers.mjs';

const GOOD = "log.info('Certificate issued', { credentialId, courseId });\n";

function repo(files = {}) {
  return fixtureRepo({
    'firebase/functions/src/grading.ts': GOOD,
    'firebase/functions/src/logging/index.ts': "console.log('x');\n",
    'firebase/functions/test/grading.test.ts': "console.log('x');\n",
    'apps/web/src/log.ts': "console.warn('x');\n",
    'apps/web/src/HomePage.tsx': GOOD,
    'scripts/tool.mjs': "console.log('x');\n",
    ...files,
  });
}

function edit(r, rel, content, tmp = tempDir()) {
  writeFiles(r, { [rel]: content });
  return runHook('logging-nudge', editPayload(path.join(r, rel)), { tmp });
}

describe('logging-nudge', () => {
  it('is silent for a statement in the required form', () => {
    const r = repo();
    const res = edit(r, 'firebase/functions/src/grading.ts', GOOD);
    assert.equal(res.status, 0);
    assert.equal(res.stdout, '');
  });

  it('flags console calls and a direct logger import, with line numbers', () => {
    const r = repo();
    const res = edit(
      r,
      'firebase/functions/src/grading.ts',
      "import { logger } from 'firebase-functions/logger';\n\nconsole.log('hi');\n",
    );
    assert.match(context(res), /line 1: direct firebase-functions\/logger import/);
    assert.match(context(res), /line 3: console\.\* call/);
    assert.match(context(res), /writing-logs/);
  });

  it('flags a value interpolated or concatenated into the message', () => {
    const r = repo();
    for (const bad of [
      'log.info(`Issued ${id}`);\n',
      "log.warn('Retake refused for ' + uid);\n",
      'log.error("Failed " + e.message, e);\n',
    ]) {
      const res = edit(r, 'apps/web/src/HomePage.tsx', bad);
      assert.match(context(res), /interpolated into the message/, bad);
    }
  });

  it('flags personal data and secrets in an info, warn or error call, but not emailPrefix or debug', () => {
    const r = repo();
    const bad = edit(
      r,
      'firebase/functions/src/grading.ts',
      "log.info('Signup', { uid, email });\n",
    );
    assert.match(context(bad), /`email` in an info call/);
    const key = edit(
      r,
      'firebase/functions/src/grading.ts',
      "log.error('Bad', err, { answerKey });\n",
    );
    assert.match(context(key), /`answerKey` in an error call/);
    for (const ok of [
      "log.info('Signup', { uid, emailPrefix });\n",
      "log.debug('Signup', { uid, email });\n",
    ]) {
      const res = edit(r, 'firebase/functions/src/grading.ts', ok);
      assert.equal(res.stdout, '', ok);
    }
  });

  it('reports a file once per session, but another file again', () => {
    const r = repo();
    const tmp = tempDir();
    assert.match(
      context(edit(r, 'firebase/functions/src/grading.ts', "console.log('a');\n", tmp)),
      /console/,
    );
    assert.equal(
      edit(r, 'firebase/functions/src/grading.ts', "console.log('b');\n", tmp).stdout,
      '',
    );
    assert.match(
      context(edit(r, 'apps/web/src/HomePage.tsx', "console.log('c');\n", tmp)),
      /console/,
    );
  });

  it('ignores tests, the logging module, other folders, unreadable payloads and non-code', () => {
    const r = repo();
    for (const rel of [
      'firebase/functions/test/grading.test.ts',
      'firebase/functions/src/logging/index.ts',
      'apps/web/src/log.ts',
      'scripts/tool.mjs',
    ]) {
      assert.equal(edit(r, rel, "console.log('x');\n").stdout, '', rel);
    }
    assert.equal(edit(r, 'apps/web/src/notes.md', "console.log('x');\n").stdout, '');
    assert.equal(runHook('logging-nudge', 'not json').stdout, '');
    assert.equal(runHook('logging-nudge', { tool_input: {} }).stdout, '');
    assert.equal(
      runHook('logging-nudge', editPayload(path.join(r, 'apps/web/src/gone.ts'))).stdout,
      '',
    );
  });
});
