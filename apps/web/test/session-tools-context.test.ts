import { describe, expect, it } from 'vitest';
import { defaultToolContext, lintWorkingCopy } from '../src/studio/session/tools/context';
import type { SessionSources } from '../src/studio/session/tools';
import { call, json, toolState } from './session-tools-fixture';
import type { Working } from '../src/studio/types';

/** The fixture's working copy with a worn phrase in the course summary and in lesson l1. */
function wornWork(): Working {
  const { work } = toolState();
  const chapters = work.course.chapters.map((c) => ({
    ...c,
    items: c.items.map((item) =>
      item.type === 'lesson' && item.id === 'l1'
        ? {
            ...item,
            blocks: item.blocks.map((b) =>
              b.type === 'markdown' ? { ...b, md: 'Let us delve into commits.' } : b,
            ),
          }
        : item,
    ),
  }));
  return {
    ...work,
    course: { ...work.course, summary: 'We delve into Git.', chapters },
  };
}

describe('lintWorkingCopy', () => {
  it('lints the whole working copy when no item is named', () => {
    const findings = lintWorkingCopy(wornWork(), { itemId: null });
    const worn = findings.filter((f) => f.rule === 'worn-phrase');
    expect(worn.map((f) => f.itemId ?? f.field)).toEqual(['summary', 'l1']);
  });

  it('lints only the named lesson or Quiz', () => {
    const findings = lintWorkingCopy(wornWork(), { itemId: 'l1' });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.itemId === 'l1')).toBe(true);
    expect(findings).toContainEqual(
      expect.objectContaining({ blockId: 'b1', field: 'md', rule: 'worn-phrase' }),
    );
  });
});

describe('defaultToolContext', () => {
  it('runs with the real clock, randomness and writing lint, and no Sources folder', async () => {
    const ctx = defaultToolContext();
    expect(ctx.sources).toBeNull();
    expect(ctx.random).toBe(Math.random);
    expect(ctx.now()).toBeInstanceOf(Date);
    expect(ctx.lintWriting).toBe(lintWorkingCopy);
    const state = { ...toolState(), work: wornWork() };
    const result = await json<{ count: number; findings: { rule: string }[] }>(
      call(state, 'lint_writing', { itemId: 'l1' }, ctx),
    );
    expect(result.count).toBeGreaterThan(0);
    expect(result.findings.map((f) => f.rule)).toContain('worn-phrase');
  });

  it('carries the Sources folder it is given', () => {
    const sources: SessionSources = {
      list: () => Promise.resolve([]),
      read: () => Promise.resolve(null),
      readImage: () => Promise.resolve(null),
    };
    expect(defaultToolContext(sources).sources).toBe(sources);
  });
});
