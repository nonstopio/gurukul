// =================================================================================================
//  After editing repo source, name the notes that govern it: CLAUDE.md, rules and skills.
//
//  PostToolUse on Edit|Write|MultiEdit. Exits 0 always and prints only when it has something to
//  say. PostToolUse cannot block, and this hook does not try: it hands the model a short list.
//
//  WHY THIS EXISTS
//
//  Notes go stale silently. A folder gains a module, a function gains a trigger, a rule's claim
//  stops being true, a skill's procedure names a script that moved, and nobody decided not to
//  write it down: the code was open and the note was not. Gurukul keeps its guidance in three
//  places, and all three rot the same way:
//
//    - the nearest CLAUDE.md at or above the file: the folder's map and contract;
//    - every .claude/rules/*.md whose `paths:` frontmatter matches the file: constraints on it;
//    - every .claude/skills/*/SKILL.md that mentions the file or its folder: procedures using it.
//
//  Naming them at the moment of the edit is the cheapest point to notice a claim just went wrong.
//
//  WHY IT IS QUIET
//
//  Firing on every edit would be the thing it is trying to prevent: a report that cries wolf
//  teaches people to ignore it. So each governing file is named ONCE per session, and only for
//  shipped source and tooling (apps/, packages/, firebase/, scripts/, .github/). Tests, build
//  output and the notes themselves say nothing.
//
//  It names the files rather than the fix, and points at the updating-claude-md skill, which
//  decides whether anything should be written at all. For most edits the answer is nothing. A
//  nudge that assumed a note was owed would generate exactly the padding that skill prevents.
//
//  WHAT IT DOES NOT DO
//
//  It does not read the notes or judge whether they are stale. Rules without `paths:` (they load
//  for every session) are not named: they are about the repo, not about this file.
// =================================================================================================

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  editedFile,
  firstTime,
  frontmatterPaths,
  isGeneratedPath,
  isTestPath,
  matchesGlob,
  readPayload,
  readText,
  relativeTo,
  repoRootOf,
  run,
  sayAfter,
} from './lib.mjs';

const SOURCE_ROOTS = ['apps/', 'packages/', 'firebase/', 'scripts/', '.github/'];

function watched(rel) {
  if (!SOURCE_ROOTS.some((r) => rel.startsWith(r))) return false;
  if (isTestPath(rel) || isGeneratedPath(rel)) return false;
  if (path.posix.basename(rel) === 'CLAUDE.md') return false;
  return true;
}

/** The nearest CLAUDE.md at or above the file, repo-relative. */
function nearestClaudeMd(root, rel) {
  let dir = path.posix.dirname(rel);
  for (;;) {
    const candidate = dir === '.' ? 'CLAUDE.md' : `${dir}/CLAUDE.md`;
    if (existsSync(path.join(root, candidate))) return candidate;
    if (dir === '.') return null;
    dir = path.posix.dirname(dir);
  }
}

function listMarkdown(dir) {
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
}

/** Rules whose `paths:` globs match the file. */
function matchingRules(root, rel) {
  return listMarkdown(path.join(root, '.claude/rules'))
    .filter((name) => {
      const globs = frontmatterPaths(readText(path.join(root, '.claude/rules', name)) ?? '');
      return globs.some((g) => matchesGlob(rel, g));
    })
    .map((name) => `.claude/rules/${name}`)
    .sort();
}

/**
 * Skills whose SKILL.md names the file's path, or its folder as a whole path token
 * (`apps/web/src/changelog/` counts for `apps/web/src/changelog/index.ts`;
 * `apps/web/src/changelog/entries/` does not, because that is a different folder).
 */
function mentioningSkills(root, rel) {
  const skillsDir = path.join(root, '.claude/skills');
  let names = [];
  try {
    names = readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const dir = path.posix.dirname(rel);
  const token = (s, trailingSlash) =>
    new RegExp(`(^|[^\\w./-])${esc(s)}${trailingSlash ? '/?' : ''}(?=$|[^\\w./-])`, 'm');
  const patterns = [token(rel, false)];
  if (dir !== '.') patterns.push(token(dir, true));
  return names
    .filter((name) => {
      const text = readText(path.join(skillsDir, name, 'SKILL.md'));
      return text !== null && patterns.some((p) => p.test(text));
    })
    .map((name) => `.claude/skills/${name}/SKILL.md`)
    .sort();
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

  const claudeMd = nearestClaudeMd(root, rel);
  const governing = [
    ...(claudeMd ? [claudeMd] : []),
    ...matchingRules(root, rel),
    ...mentioningSkills(root, rel),
  ];
  // Once per governing file per session: name only the ones this session has not seen yet.
  const fresh = governing.filter((g) => firstTime('claude-md-nudge', payload.session_id, g));
  if (fresh.length === 0) return;

  sayAfter(
    `Notes that govern ${rel}:\n${fresh.map((g) => `- ${g}`).join('\n')}\n` +
      'If this change made a claim in those wrong, or added behaviour they do not mention, ' +
      'update them in this same change, and use the updating-claude-md skill to decide which ' +
      'file a note belongs in (CLAUDE.md, a rule, or a skill). Most edits need no note; do not ' +
      'add one to be safe.',
  );
});
