// =================================================================================================
//  After changing something a Gurukul user could notice, ask whether a changelog entry is owed.
//
//  PostToolUse on Edit|Write|MultiEdit. Exits 0 always and prints only when it has something to
//  say. PostToolUse cannot block, and this hook does not try.
//
//  WHY THIS EXISTS
//
//  The changelog (apps/web/src/changelog/) lives in the repo so an entry travels with the code it
//  describes and a pull request without one is visible in review. That only works if writing one
//  is a step rather than a habit: habits do not survive a busy afternoon, and an agent has no
//  habits at all. The moment a learner-facing screen, a Kulapati control, a Studio editor, a rules
//  decision or a function's behaviour changes is the cheapest moment to ask.
//
//  IT STOPS ONCE THE ENTRY EXISTS
//
//  A reminder that keeps firing after you have complied is one people learn to skip. So it asks
//  git first, and says nothing if any file under the entries folder is new or modified (untracked,
//  staged or not). It also fires ONCE per session rather than once per file: an entry is owed per
//  change somebody would notice, not per file touched, and nudging per file would argue otherwise.
//
//  WHAT IT DOES NOT DO
//
//  It cannot tell a visible change from a refactor behind one, so it asks rather than asserts and
//  points at the skill that decides. Tests, the changelog itself and CLAUDE.md files are excluded
//  outright; tooling, scripts and CI are outside the watched paths. It does not check the entry.
//  The vitest suite (apps/web/test/changelog-entries.test.ts) and the pre-commit name check do.
// =================================================================================================

import { execFileSync } from 'node:child_process';
import {
  editedFile,
  firstTime,
  isGeneratedPath,
  isTestPath,
  readPayload,
  relativeTo,
  repoRootOf,
  run,
  sayAfter,
} from './lib.mjs';

const ENTRIES = 'apps/web/src/changelog/entries';

/** Shipped code whose behaviour a learner, Acharya or Kulapati could notice. */
function watched(rel) {
  const shipped =
    rel.startsWith('apps/web/src/') ||
    rel.startsWith('packages/ui/src/') ||
    rel === 'firebase/firestore.rules' ||
    rel.startsWith('firebase/functions/src/');
  if (!shipped) return false;
  if (isTestPath(rel) || isGeneratedPath(rel)) return false;
  if (rel.startsWith('apps/web/src/changelog/')) return false;
  if (rel === 'CLAUDE.md' || rel.endsWith('/CLAUDE.md')) return false;
  return true;
}

/** True when an entry has already been written (or edited) in the working tree. */
function entryPending(root) {
  const out = execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all', '--', ENTRIES],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  // A deletion is not an entry written. Anything else (??, A, M, R) is.
  return out
    .split('\n')
    .filter(Boolean)
    .some((line) => /[AMR?]/.test(line.slice(0, 2)));
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
  if (entryPending(root)) return;
  if (!firstTime('changelog-nudge', payload.session_id)) return;

  sayAfter(
    `This session has changed ${rel} and added no changelog entry. If a learner, Acharya or ` +
      'Kulapati would notice this change (a screen, a control, a label, a default, a message, ' +
      'who can see or do what), one entry is owed under apps/web/src/changelog/entries/, in this ' +
      'same change. Scaffold it with `npm run changelog:new -- "a few words"` and follow the ' +
      'writing-changelog-entries skill; it also says when none is owed, which is the answer for ' +
      'refactors, tests and tooling nobody can see.',
  );
});
