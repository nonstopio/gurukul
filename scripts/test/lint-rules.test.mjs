// The custom lint rules (API and logging boundaries) must actually fire where they should and stay
// quiet where the code is allowed. See `.claude/rules/api-responses.md` and `.claude/rules/logging.md`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ESLint } from 'eslint';
import { REPO } from './helpers.mjs';

const eslint = new ESLint({ cwd: REPO });

/** The rule ids ESLint reports for `code` as if it lived at `filePath`. */
async function rulesFor(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((m) => m.ruleId);
}

describe('web lint rules', () => {
  it('rejects httpsCallable outside apps/web/src/api', async () => {
    const code =
      "import { httpsCallable } from 'firebase/functions';\nexport const c = httpsCallable;\n";
    assert.ok((await rulesFor(code, 'apps/web/src/foo.ts')).includes('no-restricted-imports'));
  });

  it('allows httpsCallable inside apps/web/src/api', async () => {
    const code =
      "import { httpsCallable } from 'firebase/functions';\nexport const c = httpsCallable;\n";
    assert.deepEqual(await rulesFor(code, 'apps/web/src/api/x.ts'), []);
  });

  it('rejects console calls outside apps/web/src/log.ts, even warn and error', async () => {
    for (const method of ['log', 'warn', 'error']) {
      const code = `console.${method}('x');\n`;
      assert.ok((await rulesFor(code, 'apps/web/src/foo.ts')).includes('no-console'), method);
    }
  });

  it('allows console in apps/web/src/log.ts', async () => {
    assert.deepEqual(await rulesFor("console.warn('x');\n", 'apps/web/src/log.ts'), []);
  });

  it('rejects an interpolated or concatenated log message', async () => {
    const template =
      'declare const log: { info(...a: unknown[]): void; debug(...a: unknown[]): void; error(...a: unknown[]): void }; declare const id: string;\nlog.info(`Issued ${id}`);\n';
    const concat =
      "declare const log: { info(...a: unknown[]): void; debug(...a: unknown[]): void; error(...a: unknown[]): void }; declare const id: string;\nlog.error('Failed ' + id, new Error('x'));\n";
    assert.ok((await rulesFor(template, 'apps/web/src/foo.ts')).includes('no-restricted-syntax'));
    assert.ok((await rulesFor(concat, 'apps/web/src/foo.ts')).includes('no-restricted-syntax'));
  });

  it('passes a constant event phrase with fields', async () => {
    const code =
      "declare const log: { info(...a: unknown[]): void; debug(...a: unknown[]): void; error(...a: unknown[]): void }; declare const id: string;\nlog.info('Issued', { id });\nlog.debug(`plain`);\n";
    assert.deepEqual(await rulesFor(code, 'apps/web/src/foo.ts'), []);
  });
});

describe('functions lint rules', () => {
  const LOG =
    'declare const log: { info(...a: unknown[]): void; debug(...a: unknown[]): void; error(...a: unknown[]): void }; declare const y: string;\n';
  const importsOnCall =
    "import { onCall } from 'firebase-functions/v2/https';\nexport const f = onCall;\n";
  const importsHttpsError =
    "import { HttpsError } from 'firebase-functions/v2/https';\nexport const e = HttpsError;\n";
  const importsV1 =
    "import { https } from 'firebase-functions/v1/https';\nexport const h = https;\n";
  const importsLogger =
    "import * as logger from 'firebase-functions/logger';\nexport { logger };\n";
  const importsRootLogger = "import { logger } from 'firebase-functions';\nexport { logger };\n";

  it('rejects onCall, HttpsError, v1 https and the raw logger outside api/ and logging/', async () => {
    for (const code of [
      importsOnCall,
      importsHttpsError,
      importsV1,
      importsLogger,
      importsRootLogger,
    ]) {
      const rules = await rulesFor(code, 'firebase/functions/src/foo.ts');
      assert.ok(rules.includes('no-restricted-imports'), code);
    }
  });

  it('points the import message at the rule file', async () => {
    const [result] = await eslint.lintText(importsOnCall, {
      filePath: 'firebase/functions/src/foo.ts',
    });
    assert.match(result.messages[0].message, /api-responses\.md/);
    const [logged] = await eslint.lintText(importsLogger, {
      filePath: 'firebase/functions/src/foo.ts',
    });
    assert.match(logged.messages[0].message, /logging\.md/);
  });

  it('allows the same imports inside firebase/functions/src/api and src/logging', async () => {
    for (const dir of ['api', 'logging']) {
      for (const code of [importsOnCall, importsHttpsError, importsV1, importsLogger]) {
        assert.deepEqual(await rulesFor(code, `firebase/functions/src/${dir}/x.ts`), [], dir);
      }
    }
  });

  it('allows other firebase-functions imports anywhere in src', async () => {
    const code =
      "import { setGlobalOptions } from 'firebase-functions/v2';\nexport { setGlobalOptions };\n";
    assert.deepEqual(await rulesFor(code, 'firebase/functions/src/foo.ts'), []);
  });

  it('rejects every console method outside api/ and logging/', async () => {
    for (const method of ['log', 'info', 'debug', 'warn', 'error']) {
      const rules = await rulesFor(`console.${method}('x');\n`, 'firebase/functions/src/foo.ts');
      assert.ok(rules.includes('no-console'), method);
    }
  });

  it('rejects an interpolated or concatenated log message everywhere in src', async () => {
    const template = `${LOG}log.info(\`x \${y}\`);\n`;
    const concat = `${LOG}log.info('a' + y);\n`;
    for (const dir of ['foo.ts', 'api/x.ts', 'logging/x.ts']) {
      const file = `firebase/functions/src/${dir}`;
      assert.ok((await rulesFor(template, file)).includes('no-restricted-syntax'), dir);
      assert.ok((await rulesFor(concat, file)).includes('no-restricted-syntax'), dir);
    }
  });

  it('passes a constant event phrase with fields', async () => {
    const code = `${LOG}log.info('Issued', { y });\nlog.debug(\`plain\`);\nlog.error('Failed', new Error('x'), { y });\n`;
    assert.deepEqual(await rulesFor(code, 'firebase/functions/src/foo.ts'), []);
  });
});
