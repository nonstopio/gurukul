import type { AREAS, KINDS } from './vocabulary';

export type AreaKey = keyof typeof AREAS;
export type KindKey = keyof typeof KINDS;

/**
 * One changelog entry, as written by hand in `entries/<name>.ts`.
 *
 * There is deliberately no `version` field. Which release shipped an entry is a fact about git,
 * not something anybody types: it is derived at build time from the first `release-*` tag that
 * contains the commit that added the entry's file (see `releases.ts`). A hand-written version can
 * be wrong; a derived one cannot drift from the tags.
 */
export interface ChangelogEntry {
  /** ISO `YYYY-MM-DD`. Must equal the date at the front of the file name. */
  date: string;
  /** Issue or PR reference (`GH-42`) or a short UPPER-KEBAB tag. Part of the row key. */
  id: string;
  /** What is now true, in the user's words. */
  title: string;
  area: AreaKey;
  kind: KindKey;
  /** The reason, said out loud. The field this page exists for. */
  why: string;
  /** Points (array) or prose (string). Both render. */
  detail?: string | readonly string[];
  /** Background for the curious: alternatives rejected, history. */
  notes?: readonly string[];
  /** Only when a deploy step or ordering matters. */
  deploy?: string;
}

/** An entry as the page renders it: with its file name and the release that shipped it. */
export interface Change extends ChangelogEntry {
  file: string;
  /** The `release-*` tag that first contained it, or `null` while unreleased. */
  release: string | null;
}
