import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { context, editPayload, fixtureRepo, runHook, tempDir, writeFiles } from './helpers.mjs';

function repo() {
  return fixtureRepo({
    'firebase/functions/src/index.ts': 'export {};\n',
    'firebase/functions/src/api/callable.ts': "import { onCall } from 'x';\n",
    'firebase/functions/test/index.test.ts': 'onCall(',
    'apps/web/src/api/call.ts': 'httpsCallable(',
    'apps/web/src/pariksha/service.ts': 'export {};\n',
    'scripts/tool.mjs': 'onCall(\n',
  });
}

function edit(r, rel, content, tmp = tempDir()) {
  writeFiles(r, { [rel]: content });
  return runHook('api-response-nudge', editPayload(path.join(r, rel)), { tmp });
}

describe('api-response-nudge', () => {
  it('flags onCall, onRequest and HttpsError outside src/api/', () => {
    const r = repo();
    const res = edit(
      r,
      'firebase/functions/src/index.ts',
      "import { HttpsError, onCall } from 'firebase-functions/v2/https';\nexport const x = onCall(async () => 1);\nthrow new HttpsError('internal', 'x');\n",
    );
    assert.match(context(res), /line 1: onCall\/onRequest outside src\/api\//);
    assert.match(context(res), /line 3: HttpsError outside src\/api\//);
    assert.match(context(res), /api-responses\.md/);
  });

  it('flags a hand-built failure object', () => {
    const r = repo();
    for (const bad of ['return { ok: false, reason: x };\n', 'return { success: false };\n']) {
      const res = edit(r, 'firebase/functions/src/index.ts', bad);
      assert.match(context(res), /hand-built failure object/, bad);
    }
  });

  it('flags httpsCallable in a web service', () => {
    const r = repo();
    const res = edit(r, 'apps/web/src/pariksha/service.ts', "const c = httpsCallable(f, 'x');\n");
    assert.match(context(res), /httpsCallable outside src\/api\//);
  });

  it('is silent for clean code, the api folders, tests and other folders', () => {
    const r = repo();
    for (const [rel, text] of [
      ['firebase/functions/src/index.ts', "export const a = apiCallable('a', async () => 1);\n"],
      ['firebase/functions/src/api/callable.ts', "import { onCall, HttpsError } from 'x';\n"],
      ['firebase/functions/test/index.test.ts', 'onCall(HttpsError)\n'],
      ['apps/web/src/api/call.ts', 'httpsCallable(f, "x")\n'],
      ['apps/web/src/pariksha/service.ts', 'export {};\n'],
      ['scripts/tool.mjs', 'onCall(\n'],
      ['firebase/functions/src/notes.md', 'onCall(\n'],
    ]) {
      assert.equal(edit(r, rel, text).stdout, '', rel);
    }
  });

  it('reports a file once per session and ignores bad payloads', () => {
    const r = repo();
    const tmp = tempDir();
    assert.match(
      context(edit(r, 'firebase/functions/src/index.ts', 'onCall(a);\n', tmp)),
      /onCall/,
    );
    assert.equal(edit(r, 'firebase/functions/src/index.ts', 'onCall(b);\n', tmp).stdout, '');
    assert.equal(runHook('api-response-nudge', 'garbage').stdout, '');
    assert.equal(runHook('api-response-nudge', { tool_input: {} }).stdout, '');
    assert.equal(
      runHook('api-response-nudge', editPayload(path.join(r, 'firebase/functions/src/gone.ts')))
        .stdout,
      '',
    );
  });
});
