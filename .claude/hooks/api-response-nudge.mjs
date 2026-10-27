// =================================================================================================
//  After editing a function or a service call, flag code that steps outside the API contract.
//
//  PostToolUse on Edit|Write|MultiEdit. Exits 0 always and prints only when it finds something. It
//  is ADVISORY: ESLint (`npm run lint`, CI) is the enforcement.
//
//  WHY THIS EXISTS
//
//  Every API returns one envelope (`ApiResponse`, packages/schema/src/api.ts) and fails with a
//  catalog code (.plan/16-api-contract.md). That only holds if exactly one place speaks to the
//  client: the callable wrapper in firebase/functions/src/api/, and on the browser side
//  apps/web/src/api/. A handler that calls `onCall` or throws `HttpsError` directly, or a screen that
//  calls `httpsCallable` itself, is a second place that can return something else.
//
//  WHAT IT LOOKS FOR (one report per file per session)
//    - firebase/functions/src outside api/ : onCall, onRequest, HttpsError
//    - apps/web/src outside api/           : httpsCallable
//    - firebase/functions/src outside api/ : a handler returning an ad-hoc failure
//      (`ok: false`, `success: false` built by hand, `error:` objects)
//
//  WHAT IT DOES NOT DO
//
//  Tests, generated files and the api/ folders themselves are never reported. It cannot prove a
//  response is well formed; the tests that parse every callable's body with `apiResponseSchema` do.
// =================================================================================================

import {
  editedFile,
  firstTime,
  isGeneratedPath,
  isTestPath,
  readPayload,
  readText,
  relativeTo,
  repoRootOf,
  run,
  sayAfter,
} from './lib.mjs';

const FUNCTIONS = 'firebase/functions/src/';
const WEB = 'apps/web/src/';

/** Which area of the contract a file falls under, or null when it is out of scope. */
export function scope(rel) {
  if (isTestPath(rel) || isGeneratedPath(rel) || !/\.[cm]?[jt]sx?$/.test(rel)) return null;
  if (rel.startsWith(`${FUNCTIONS}api/`) || rel.startsWith(`${WEB}api/`)) return null;
  if (rel.startsWith(FUNCTIONS)) return 'functions';
  if (rel.startsWith(WEB)) return 'web';
  return null;
}

export function findings(text, area) {
  const out = [];
  text.split('\n').forEach((raw, i) => {
    const n = i + 1;
    const line = raw.replace(/\/\/.*$/, '');
    if (area === 'functions') {
      if (
        /\b(onCall|onRequest)\s*[<(]/.test(line) ||
        /from\s+['"]firebase-functions\/(v1|v2)\/https['"]/.test(line)
      ) {
        out.push(
          `line ${n}: onCall/onRequest outside src/api/ — export callables through the wrapper`,
        );
      }
      if (/\bHttpsError\b/.test(line)) {
        out.push(
          `line ${n}: HttpsError outside src/api/ — throw \`ApiException(code, params)\` instead`,
        );
      }
      if (/\b(ok|success)\s*:\s*false\b/.test(line)) {
        out.push(
          `line ${n}: a hand-built failure object — throw \`ApiException\`; the wrapper builds the envelope`,
        );
      }
    }
    if (area === 'web' && /\bhttpsCallable\s*[<(]/.test(line)) {
      out.push(`line ${n}: httpsCallable outside src/api/ — call functions through the api helper`);
    }
  });
  return out;
}

await run(async () => {
  const payload = await readPayload();
  if (!payload) return;
  const file = editedFile(payload);
  if (!file) return;
  const root = repoRootOf(file);
  if (!root) return;
  const rel = relativeTo(root, file);
  const area = rel && scope(rel);
  if (!area) return;
  const text = readText(file);
  if (text === null) return;
  const found = findings(text, area);
  if (found.length === 0) return;
  if (!firstTime('api-response-nudge', payload.session_id, rel)) return;

  sayAfter(
    `${rel} steps outside the API contract:\n- ${found.slice(0, 8).join('\n- ')}\n\n` +
      'Every API returns the one `ApiResponse` envelope — success and failure — and fails with a ' +
      'catalog code. Only the wrapper (firebase/functions/src/api/) builds responses and throws ' +
      'HttpsError; the browser calls functions only through apps/web/src/api/. See ' +
      '.claude/rules/api-responses.md and .plan/16-api-contract.md; `npm run lint` fails on these.',
  );
});
