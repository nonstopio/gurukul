// The Gurukul changelog.
//
// ─────────────────────────────────────────────────────────────────────────────
// IF YOU ARE CHANGING WHAT SOMEONE USING GURUKUL SEES OR CAN DO, ADD AN ENTRY IN
// THE SAME COMMIT.
// ─────────────────────────────────────────────────────────────────────────────
//
// That rule is the whole design. Entries live in the repo, not in Firestore, so an entry travels
// with the code it describes: a pull request that changes behaviour and adds none is visible in
// review, and the text cannot be edited after the fact and quietly drift from what shipped.
//
// ONE FILE PER ENTRY: `entries/YYYY-MM-DD-HHMMSS-slug.ts`, the date and India time it was written
// (`TZ=Asia/Kolkata date +%Y-%m-%d-%H%M%S`). One shared array would put every branch's entry on the
// same lines of the same file — a guaranteed merge conflict. New files cannot conflict. The time to
// the second means nobody hunts for "the next free number", so nothing is ever renamed.
//
// Roughly one entry per change somebody would notice, not one per commit. `git log` already says
// WHAT changed; the entry exists for WHY. See `.claude/skills/writing-changelog-entries/`.
//
// NO VERSION FIELD. The release an entry shipped in is derived from git tags at build time
// (`releases.ts`), so it cannot be wrong and nobody has to remember to stamp it.

import { readReleaseData } from './releases';
import type { Change, ChangelogEntry } from './types';
import { AREAS, KINDS } from './vocabulary';

export { AREAS, KINDS };
export type { Change, ChangelogEntry };

type EntryModules = Record<string, { default: ChangelogEntry }>;

/** `./entries/2026-10-27-014311-foo.ts` → `2026-10-27-014311-foo.ts` */
export function fileOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Every entry, newest first, with its release attached.
 *
 * Sorted on the FILE NAME, descending: `YYYY-MM-DD-HHMMSS-` at the front gives newest day first
 * and, within a day, latest written first. The `date` field alone cannot order entries within a
 * day. `test/changelog-entries.test.ts` keeps file name and `date` in agreement.
 */
export function collectChanges(
  modules: EntryModules,
  releases: ReturnType<typeof readReleaseData>,
): Change[] {
  return Object.entries(modules)
    .map(([path, mod]) => {
      const file = fileOf(path);
      return { ...mod.default, file, release: releases.byFile[file] ?? null };
    })
    .sort((a, b) => b.file.localeCompare(a.file));
}

export interface ChangeFilter {
  query: string;
  area: string;
  kind: string;
}

/** Search covers the reason and the detail too: people remember what a change was about. */
export function filterChanges(
  changes: readonly Change[],
  { query, area, kind }: ChangeFilter,
): Change[] {
  const needle = query.trim().toLowerCase();
  return changes.filter((c) => {
    if (area && c.area !== area) return false;
    if (kind && c.kind !== kind) return false;
    if (!needle) return true;
    const detail = typeof c.detail === 'string' ? [c.detail] : (c.detail ?? []);
    return [c.title, c.why, c.id, ...detail, c.deploy ?? '']
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });
}

export interface ChangeGroup {
  key: string;
  label: string;
  unreleased: boolean;
  items: Change[];
}

/**
 * Unreleased first ("is my fix live?" is why people open this page), then each release, newest
 * first, in the order git gave the tags. Collected into a Map rather than by walking the list, so
 * one mis-sorted entry can never split a release heading in two.
 */
export function groupChanges(
  changes: readonly Change[],
  releaseOrder: readonly string[],
): ChangeGroup[] {
  const byKey = new Map<string, ChangeGroup>();
  for (const c of changes) {
    const key = c.release ?? 'unreleased';
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: c.release ?? 'Unreleased', unreleased: c.release === null, items: [] };
      byKey.set(key, group);
    }
    group.items.push(c);
  }
  const rank = (g: ChangeGroup) => {
    if (g.unreleased) return -1;
    const i = releaseOrder.indexOf(g.key);
    return i === -1 ? releaseOrder.length : i;
  };
  return [...byKey.values()].sort((a, b) => rank(a) - rank(b) || b.key.localeCompare(a.key));
}

const releaseData = readReleaseData(
  import.meta.glob<{ default: ReturnType<typeof readReleaseData> }>('./releases.generated.json', {
    eager: true,
  }),
);

/** Every entry, newest first. */
export const CHANGES: Change[] = collectChanges(
  import.meta.glob<{ default: ChangelogEntry }>('./entries/*.ts', { eager: true }),
  releaseData,
);

/** Release names, newest first. */
export const RELEASES: readonly string[] = releaseData.releases;
