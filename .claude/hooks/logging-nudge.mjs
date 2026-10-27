// =================================================================================================
//  After editing a function or a screen, flag a log statement that breaks the logging standard.
//
//  PostToolUse on Edit|Write|MultiEdit. Exits 0 always and prints only when it finds something.
//  It is ADVISORY: ESLint (`npm run lint`, CI) is the enforcement; this hook says so in the same
//  turn, while the statement is still in your head.
//
//  WHY THIS EXISTS
//
//  Gurukul logs structured events through one helper (`log`), with masking by field name and a
//  hard "constant message, fields in an object" form (.plan/17-logging.md, skill: writing-logs). A
//  stray console.log or a value interpolated into a message is a line nobody can query, and an
//  email or an answer key in a field is a leak. The cheapest moment to fix any of them is the edit.
//
//  WHAT IT LOOKS FOR (in the edited file, one report per file per session)
//    1. console.*                                  -> use `log`
//    2. a direct import of firebase-functions/logger -> use `log`
//    3. a log call whose message interpolates or concatenates a value -> constant phrase + fields
//    4. a sensitive field name (email, displayName, password, token, answer keys, phone, dob,
//       address) in an info / warn / error call    -> use `uid` / ids; payloads go to debug
//
//  WHAT IT DOES NOT DO
//
//  It does not read tests, the logging module itself, generated files or anything outside
//  firebase/functions/src and apps/web/src. It does not try to prove a statement is safe; it names
//  the shapes that are never right. Heuristics, on purpose: a false positive costs one glance.
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

const LOGGING_HOME = ['firebase/functions/src/logging/', 'apps/web/src/log.ts'];

function watched(rel) {
  const inScope = rel.startsWith('firebase/functions/src/') || rel.startsWith('apps/web/src/');
  if (!inScope || isTestPath(rel) || isGeneratedPath(rel)) return false;
  if (!/\.[cm]?[jt]sx?$/.test(rel)) return false;
  return !LOGGING_HOME.some((home) => rel === home || rel.startsWith(home));
}

const SENSITIVE =
  /\b(email|displayName|password|passwd|token|idToken|secret|apiKey|answerKey|correctOptionIds|phone|mobile|dob|dateOfBirth|address|learnerName|firstName|lastName)\b/;

/** The findings for one file, as `line N: message` strings. */
export function findings(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    const n = i + 1;
    const code = line.replace(/\/\/.*$/, '');
    if (/\bconsole\.(log|info|debug|warn|error|trace)\s*\(/.test(code)) {
      out.push(`line ${n}: console.* call — log through \`log\` instead`);
    }
    if (/from\s+['"]firebase-functions\/logger['"]/.test(code)) {
      out.push(`line ${n}: direct firebase-functions/logger import — use \`log\``);
    }
    if (/\blog\.(debug|info|warn|error)\(\s*(`[^`]*\$\{|'[^']*'\s*\+|"[^"]*"\s*\+)/.test(code)) {
      out.push(
        `line ${n}: a value is interpolated into the message — use a constant phrase and a fields object`,
      );
    }
    const call = /\blog\.(info|warn|error)\(/.exec(code);
    if (call) {
      const fields = code.slice(call.index + call[0].length).replace(/\bemailPrefix\b/g, '');
      const hit = SENSITIVE.exec(fields);
      if (hit) {
        out.push(
          `line ${n}: \`${hit[1]}\` in an ${call[1]} call — personal data and secrets do not belong at INFO and above; log \`uid\`/ids, put payloads on \`log.debug\``,
        );
      }
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
  if (!rel || !watched(rel)) return;
  const text = readText(file);
  if (text === null) return;
  const found = findings(text);
  if (found.length === 0) return;
  if (!firstTime('logging-nudge', payload.session_id, rel)) return;

  sayAfter(
    `${rel} has log statements that break the logging standard:\n- ${found.slice(0, 8).join('\n- ')}\n\n` +
      "Every statement is `log.<level>('Constant event', { fields })` through the one helper, " +
      'with standard field names, no personal data or secrets at INFO and above, and an error ' +
      'logged once (the API wrapper does it). See the writing-logs skill and .plan/17-logging.md; ' +
      '`npm run lint` fails on the first three.',
  );
});
