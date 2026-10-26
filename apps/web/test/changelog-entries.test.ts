// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AREAS, CHANGES, KINDS } from '../src/changelog';

/**
 * The contract between an entry FILE and the entry inside it. Order comes from sorting file
 * names, so a name that disagrees with its contents files the entry on the wrong day while
 * looking perfectly fine. Types catch a bad `area` or `kind`; these catch everything types can't.
 */
const DIR = resolve(import.meta.dirname, '../src/changelog/entries');
const NAME = /^(\d{4}-\d{2}-\d{2})-(\d{6})-[a-z0-9-]+\.ts$/;
const files = readdirSync(DIR).filter((f) => f.endsWith('.ts'));

describe('changelog entry files', () => {
  it('are named YYYY-MM-DD-HHMMSS-lowercase-words.ts', () => {
    expect(
      files.filter((f) => !NAME.test(f)),
      'Name it with the India time it was written: TZ=Asia/Kolkata date +%Y-%m-%d-%H%M%S',
    ).toEqual([]);
  });

  it('carry the same date in the name and in the entry', () => {
    const wrong = CHANGES.filter((c) => c.file.slice(0, 10) !== c.date).map(
      (c) => `${c.file}: entry says ${c.date}`,
    );
    expect(wrong).toEqual([]);
  });

  it('hold exactly one entry each, as a default export that satisfies ChangelogEntry', () => {
    const problems = files.filter((f) => {
      const src = readFileSync(resolve(DIR, f), 'utf8');
      const exports = src.match(/^export /gm) ?? [];
      return (
        exports.length !== 1 ||
        !/^export default \{/m.test(src) ||
        !/\} satisfies ChangelogEntry;\s*$/.test(src)
      );
    });
    expect(problems).toEqual([]);
  });

  it('never share a day and a time', () => {
    const stamps = files.map((f) => f.slice(0, 17));
    expect(stamps.filter((s, i) => stamps.indexOf(s) !== i)).toEqual([]);
  });

  it('give every entry a row key no other entry shares', () => {
    // The page keys rows on date-id-title; React drops a duplicate key's second row silently.
    const keys = CHANGES.map((c) => `${c.date}-${c.id}-${c.title}`);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it('are all collected, newest file first', () => {
    // An empty glob is not an error: if the pattern ever stops matching, entries vanish quietly.
    expect(CHANGES.map((c) => c.file)).toEqual([...files].sort().reverse());
  });

  it('write a reason that is not the title', () => {
    const lazy = CHANGES.filter((c) => !c.why.trim() || c.why.trim() === c.title.trim());
    expect(lazy.map((c) => c.file)).toEqual([]);
  });

  it('leave none of the changelog:new template text behind', () => {
    const template = CHANGES.filter(
      (c) =>
        c.id === 'GH-0000' ||
        c.title.startsWith('What is now true') ||
        c.why.startsWith('The reason, said out loud'),
    );
    expect(template.map((c) => c.file)).toEqual([]);
  });

  it('use only known areas and kinds, and well-formed detail and notes', () => {
    const problems = CHANGES.filter(
      (c) =>
        !(c.area in AREAS) ||
        !(c.kind in KINDS) ||
        !c.id.trim() ||
        (Array.isArray(c.detail) && c.detail.some((d) => typeof d !== 'string' || !d.trim())) ||
        (c.notes !== undefined && !Array.isArray(c.notes)),
    );
    expect(problems.map((c) => c.file)).toEqual([]);
  });
});
