// =================================================================================================
//  Ask before writing something that looks like a secret into this PUBLIC repository.
//
//  PreToolUse on Write|Edit|MultiEdit. Exits 0 always. It never denies: it turns a silent write
//  into a prompt that says what it found and where the value belongs instead.
//
//  WHY THIS EXISTS
//
//  Gurukul is open source. A key that reaches a commit is public the moment it is pushed, and
//  rewriting history does not un-publish it: the only fix is to rotate it. .gitignore already
//  keeps .env files and service-account JSON out of git, but a secret pasted into a source file,
//  a test fixture or a doc is caught by nothing until GitHub's scanner sees it, after the push.
//  The cheapest moment to stop it is before the file is written.
//
//  It asks when the new content holds a PEM private key, a Google service-account key, a GitHub
//  token, an AWS access key or a Slack token; or when the target is a .env / .env.* file (except
//  .env.example) or a service-account / firebase-adminsdk JSON file.
//
//  THE FIREBASE WEB apiKey (AIza...) IS NOT A SECRET and is never flagged. It identifies the
//  project to Google; access is decided by the security rules. It still comes from VITE_FIREBASE_*
//  variables rather than source, but that is configuration hygiene, not this hook's job.
//
//  WHAT IT DOES NOT DO
//
//  It reads only what is being written (Write content, Edit new_string, MultiEdit edits), not the
//  rest of the file, and it knows a handful of token shapes, not every one. A generic password or
//  an unprefixed API key slips through. If the payload cannot be read it stays silent (fail open):
//  this runs on every write, and .gitignore plus push protection remain behind it.
// =================================================================================================

import path from 'node:path';
import { decideBefore, readPayload, run } from './lib.mjs';

const PATTERNS = [
  ['a PEM private key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/],
  ['an AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['a Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
];

/** Every string the tool is about to write. */
function writtenText(input) {
  const parts = [];
  if (typeof input?.content === 'string') parts.push(input.content);
  if (typeof input?.new_string === 'string') parts.push(input.new_string);
  if (Array.isArray(input?.edits)) {
    for (const e of input.edits) if (typeof e?.new_string === 'string') parts.push(e.new_string);
  }
  return parts.join('\n');
}

function secretInText(text) {
  if (/"type"\s*:\s*"service_account"/.test(text) && /"private_key"\s*:/.test(text)) {
    return 'a Google service-account key';
  }
  for (const [label, re] of PATTERNS) if (re.test(text)) return label;
  return null;
}

function secretPath(file) {
  const base = path.basename(file);
  if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') return `${base}, an environment file`;
  if (/service-account.*\.json$/i.test(base) || /firebase-adminsdk.*\.json$/i.test(base)) {
    return `${base}, a service-account key file`;
  }
  return null;
}

await run(async () => {
  const payload = await readPayload();
  if (!payload) return;
  const input = payload.tool_input ?? {};
  const file = typeof input.file_path === 'string' ? input.file_path : '';

  const fromPath = file ? secretPath(file) : null;
  const fromText = secretInText(writtenText(input));
  if (!fromPath && !fromText) return;

  const found = [
    fromText && `the content looks like ${fromText}`,
    fromPath && `the target is ${fromPath}`,
  ]
    .filter(Boolean)
    .join(', and ');

  decideBefore(
    'ask',
    `POSSIBLE SECRET IN A PUBLIC REPOSITORY\n\n${file || '(no file path)'}: ${found}.\n\n` +
      'Gurukul is open source: anything committed here is public once pushed, and the only fix ' +
      'for a leaked key is rotating it. Secrets belong in GitHub Actions secrets (CI and deploy) ' +
      'or in a gitignored apps/web/.env.local on your machine; .env.example holds names and ' +
      'placeholders only. The public Firebase web apiKey is fine and is not what triggered this.',
  );
});
