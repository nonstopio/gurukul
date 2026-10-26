// Shared plumbing for the Gurukul Claude Code hooks. Node 22, no dependencies.
//
// Every hook in this folder follows the same contract:
//
// - It reads one JSON payload from stdin and ALWAYS exits 0. A hook that crashes is invisible at
//   best and a confusing error at worst, so anything unexpected means "nothing to say".
// - It prints JSON only when it has something to say. Silence is the normal case.
// - Nudges fire once per session (or once per governing file per session), tracked by empty
//   marker files under os.tmpdir(). The OS clears that folder, which is the retention policy we
//   want: nothing here should outlive the machine's idea of "recent".
//
// Written in Node rather than bash + jq because jq is not on every contributor's machine and Node
// 22 is already required to work on the repo at all.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Reads stdin and parses it. Returns null when the payload is missing or not a JSON object. */
export async function readPayload() {
  let raw = '';
  try {
    for await (const chunk of process.stdin) raw += chunk;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Adds context for the model after a tool ran. PostToolUse cannot block, and we never try. */
export function sayAfter(text) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text },
    })}\n`,
  );
}

/** Answers a PreToolUse permission question ("ask" in every hook here). */
export function decideBefore(decision, reason) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
}

/** The edited file as an absolute path, or '' when the payload names none. */
export function editedFile(payload) {
  const file = payload?.tool_input?.file_path;
  if (typeof file !== 'string' || !file) return '';
  const base = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  return path.resolve(base, file);
}

/** The git top-level directory containing `file`, or null outside a repository. */
export function repoRootOf(file) {
  let dir = path.dirname(file);
  while (!existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** `file` relative to `root`, with forward slashes; null when it is outside `root`. */
export function relativeTo(root, file) {
  // realpath both sides so a symlinked tmpdir (macOS /var → /private/var) still compares equal.
  const real = (p) => {
    try {
      return realpathOf(p);
    } catch {
      return p;
    }
  };
  const rel = path.relative(real(root), real(file));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

function realpathOf(p) {
  // The file may not exist yet (PreToolUse on a new file): resolve its nearest existing parent.
  let probe = p;
  const tail = [];
  while (!existsSync(probe)) {
    tail.unshift(path.basename(probe));
    const parent = path.dirname(probe);
    if (parent === probe) return p;
    probe = parent;
  }
  return path.join(realpathSync.native(probe), ...tail);
}

/**
 * True the first time it is called for (hook, session, key), false after that. The marker is an
 * empty file created with the exclusive flag, so two hooks racing on one key cannot both win.
 */
export function firstTime(hook, session, key = 'session') {
  const safeSession = String(session || 'nosession').replace(/[^A-Za-z0-9_-]/g, '_');
  const dir = path.join(os.tmpdir(), 'gurukul-claude-hooks', hook, safeSession);
  const name = createHash('sha256').update(key).digest('hex').slice(0, 16);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, name), '', { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

/** Reads a UTF-8 file, or returns null if it cannot. */
export function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Tests, fixtures and test helpers: never the subject of a nudge. */
export function isTestPath(rel) {
  return (
    /(^|\/)(test|tests|__tests__|__mocks__|fixtures)\//.test(rel) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel)
  );
}

/** Build output and dependencies. */
export function isGeneratedPath(rel) {
  return (
    /(^|\/)(node_modules|dist|coverage|\.vite)\//.test(rel) ||
    rel.startsWith('firebase/functions/lib/') ||
    rel.endsWith('.generated.json')
  );
}

/**
 * A small glob matcher for the `paths:` frontmatter of `.claude/rules/*.md`.
 * Supports `**` (any number of segments, including none), `*` (within one segment), `?`, and
 * literal paths. Matched against a repo-relative path with forward slashes.
 */
export function globToRegExp(glob) {
  let g = glob.trim().replace(/^\.\//, '');
  let out = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      const before = i === 0 || g[i - 1] === '/';
      const after = g[i + 2] === '/' || i + 2 === g.length;
      if (before && g[i + 2] === '/') {
        out += '(?:.*/)?';
        i += 2;
      } else if (before && after && out.endsWith('/')) {
        // `dir/**` matches `dir` itself and everything below it.
        out = `${out.slice(0, -1)}(?:/.*)?`;
        i += 1;
      } else {
        out += '.*';
        i += 1;
      }
    } else if (c === '*') {
      out += '[^/]*';
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

export function matchesGlob(rel, glob) {
  return globToRegExp(glob).test(rel);
}

/** The `paths:` list from a markdown file's YAML frontmatter; [] when there is none. */
export function frontmatterPaths(markdown) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!fm) return [];
  const lines = fm[1].split(/\r?\n/);
  const unquote = (s) => s.trim().replace(/^['"]|['"]$/g, '');
  const at = lines.findIndex((l) => /^paths\s*:/.test(l));
  if (at === -1) return [];
  const inline = lines[at].replace(/^paths\s*:\s*/, '').trim();
  if (inline.startsWith('[')) {
    return inline
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(unquote)
      .filter(Boolean);
  }
  if (inline) return [unquote(inline)];
  const out = [];
  for (const line of lines.slice(at + 1)) {
    const item = /^\s*-\s*(.+)$/.exec(line);
    if (!item) break;
    out.push(unquote(item[1]));
  }
  return out;
}

/** Runs `main`, swallowing anything it throws: a hook must never fail the tool call. */
export async function run(main) {
  try {
    await main();
  } catch {
    // Fail open. Nothing to say is the safe answer for a nudge.
  }
  process.exitCode = 0;
}
