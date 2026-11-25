import { describe, expect, it } from 'vitest';
import type { Block } from '@gurukul/schema';
import { call, lessonOf, must, ok, refused, toolState } from './session-tools-fixture';
import type { SessionState } from '../src/studio/session/tools';

const blocksOf = (state: SessionState, id: string): Block[] => {
  const lesson = lessonOf(state, id);
  if (lesson?.type !== 'lesson') throw new Error('not a lesson');
  return lesson.blocks;
};
const blockIds = (state: SessionState, id: string) => blocksOf(state, id).map((b) => b.id);

describe('add_block', () => {
  it('adds each writable kind of block with an id made by the app', async () => {
    let state = toolState();
    const inputs = [
      { type: 'markdown', md: 'Rebase replays commits.' },
      {
        type: 'code',
        lang: 'bash',
        code: 'git rebase main',
        file: 'shell',
        terminal: true,
        highlight: '',
      },
      { type: 'callout', tone: 'warning', title: 'Careful', md: 'Never rebase shared work.' },
      {
        type: 'check',
        prompt: 'Safe?',
        options: ['Yes', 'No'],
        correct: 1,
        explanation: 'It rewrites.',
      },
    ];
    for (const block of inputs)
      state = (await ok(call(state, 'add_block', { lessonId: 'l3', block }))).state;
    const blocks = blocksOf(state, 'l3');
    expect(blocks.map((b) => b.type)).toEqual(['markdown', 'code', 'callout', 'check']);
    for (const b of blocks) expect(b.id).toMatch(/^b-[0-9a-f]{8}$/);
    expect(blocks[1]).toMatchObject({ copy: true, terminal: true, file: 'shell' });
    expect('highlight' in must(blocks[1])).toBe(false);
    expect(blocks[3]).toMatchObject({ options: ['Yes', 'No'], correct: 1 });
  });

  it('puts the block at a position and says where', async () => {
    const { state, text } = await ok(
      call(toolState(), 'add_block', {
        lessonId: 'l1',
        block: { type: 'markdown', md: 'First.' },
        position: 1,
      }),
    );
    const made = must(blocksOf(state, 'l1')[0]);
    expect(made).toMatchObject({ md: 'First.' });
    expect(text).toBe(`Added markdown block ${made.id} at position 1.`);
  });

  it('never accepts a file block, an upload or an address on a text block', async () => {
    for (const block of [
      { type: 'file', url: 'https://example.com/a.pdf', label: 'A' },
      { type: 'image', url: 'https://example.com/a.png', alt: 'A', upload: { path: 'x' } },
      { type: 'image', url: 'https://example.com/a.png', alt: 'A', width: 10, height: 10 },
      { type: 'video', url: 'https://youtu.be/abc123', provider: 'loom' },
      { type: 'markdown', md: 'x', url: 'https://example.com' },
    ])
      expect(await refused(call(toolState(), 'add_block', { lessonId: 'l1', block }))).toMatch(
        /^The input for add_block is not valid\./,
      );
  });

  it('refuses a check whose right answer is not one of its options', async () => {
    const block = { type: 'check', prompt: 'P', options: ['A', 'B'], correct: 3, explanation: 'E' };
    expect(await refused(call(toolState(), 'add_block', { lessonId: 'l1', block }))).toBe(
      'correct must be an index from 0 to 1, one of the 2 options.',
    );
  });

  it('refuses a 61st block with the limit in words', async () => {
    const state = toolState();
    const lesson = lessonOf(state, 'l3');
    if (lesson?.type === 'lesson')
      lesson.blocks = Array.from({ length: 60 }, (_, i) => ({
        type: 'markdown',
        id: `m${i}`,
        md: 'x',
      }));
    expect(
      await refused(
        call(state, 'add_block', { lessonId: 'l3', block: { type: 'markdown', md: 'y' } }),
      ),
    ).toBe(
      'Nothing was changed. A lesson holds at most 60 blocks. Split it into two lessons, or remove a block first.',
    );
  });

  it('refuses a Quiz or an unknown lesson', async () => {
    const block = { type: 'markdown', md: 'x' };
    expect(await refused(call(toolState(), 'add_block', { lessonId: 'q1', block }))).toBe(
      '"q1" is a Quiz, not a lesson. Use the Quiz tools for it.',
    );
    expect(await refused(call(toolState(), 'add_block', { lessonId: 'zz', block }))).toMatch(
      /^There is no lesson or Quiz with id "zz"/,
    );
  });
});

describe('update_block', () => {
  it('changes text fields of a block, and only the words of a media block', async () => {
    const md = await ok(
      call(toolState(), 'update_block', {
        lessonId: 'l1',
        blockId: 'b1',
        changes: { md: 'Commit.' },
      }),
    );
    expect(blocksOf(md.state, 'l1')[0]).toEqual({ type: 'markdown', id: 'b1', md: 'Commit.' });
    expect(md.text).toBe('Updated block b1: md.');
    const image = await ok(
      call(toolState(), 'update_block', {
        lessonId: 'l1',
        blockId: 'b3',
        changes: { alt: 'The diff view', caption: 'Diff' },
      }),
    );
    expect(blocksOf(image.state, 'l1')[2]).toMatchObject({
      url: 'https://example.com/diff.png',
      alt: 'The diff view',
      caption: 'Diff',
    });
  });

  it('removes an optional text field given as empty', async () => {
    const state = toolState();
    const code = blocksOf(state, 'l1')[1];
    if (code?.type === 'code') code.file = 'shell';
    const { state: next } = await ok(
      call(state, 'update_block', { lessonId: 'l1', blockId: 'b2', changes: { file: '' } }),
    );
    expect('file' in must(blocksOf(next, 'l1')[1])).toBe(false);
  });

  it('refuses fields the block type does not have, naming what it has', async () => {
    expect(
      await refused(
        call(toolState(), 'update_block', { lessonId: 'l1', blockId: 'b3', changes: { md: 'x' } }),
      ),
    ).toBe('A image block has no md you can change. You can change: alt, caption.');
    expect(
      await refused(
        call(toolState(), 'update_block', {
          lessonId: 'l1',
          blockId: 'b3',
          changes: { url: 'https://evil.example' },
        }),
      ),
    ).toBe('The input for update_block is not valid. Changes: Unrecognized key: "url".');
  });

  it('keeps a check’s right answer pointing at one of its options', async () => {
    const shrink = await refused(
      call(toolState(), 'update_block', {
        lessonId: 'l1',
        blockId: 'b4',
        changes: { options: ['Only', 'Two'], correct: 2 },
      }),
    );
    expect(shrink).toBe('correct must be an index from 0 to 1, one of the 2 options.');
    const reworded = await ok(
      call(toolState(), 'update_block', {
        lessonId: 'l1',
        blockId: 'b4',
        changes: { options: ['A full snapshot', 'Only a diff', 'Nothing'] },
      }),
    );
    expect(blocksOf(reworded.state, 'l1')[3]).toMatchObject({ correct: 0 });
  });

  it('refuses an unknown block and an empty change', async () => {
    expect(
      await refused(
        call(toolState(), 'update_block', { lessonId: 'l1', blockId: 'zz', changes: { md: 'x' } }),
      ),
    ).toBe('Lesson "l1" has no block "zz". Call get_item to see its blocks.');
    expect(
      await refused(
        call(toolState(), 'update_block', { lessonId: 'l1', blockId: 'b1', changes: {} }),
      ),
    ).toBe('Give at least one field to change.');
    expect(
      await refused(
        call(toolState(), 'update_block', { lessonId: 'q1', blockId: 'b1', changes: { md: 'x' } }),
      ),
    ).toMatch(/is a Quiz/);
  });
});

describe('move_block and remove_block', () => {
  it('moves a block', async () => {
    const { state, text } = await ok(
      call(toolState(), 'move_block', { lessonId: 'l1', blockId: 'b4', position: 1 }),
    );
    expect(blockIds(state, 'l1')).toEqual(['b4', 'b1', 'b2', 'b3']);
    expect(text).toBe('Moved block b4 to position 1.');
  });

  it('removes a block', async () => {
    const { state, text } = await ok(
      call(toolState(), 'remove_block', { lessonId: 'l1', blockId: 'b2' }),
    );
    expect(blockIds(state, 'l1')).toEqual(['b1', 'b3', 'b4']);
    expect(text).toBe('Removed block b2.');
  });

  it('refuse unknown blocks and lessons', async () => {
    const none = 'Lesson "l1" has no block "zz". Call get_item to see its blocks.';
    expect(
      await refused(
        call(toolState(), 'move_block', { lessonId: 'l1', blockId: 'zz', position: 1 }),
      ),
    ).toBe(none);
    expect(
      await refused(call(toolState(), 'remove_block', { lessonId: 'l1', blockId: 'zz' })),
    ).toBe(none);
    expect(
      await refused(call(toolState(), 'remove_block', { lessonId: 'q1', blockId: 'b1' })),
    ).toMatch(/is a Quiz/);
    expect(
      await refused(
        call(toolState(), 'move_block', { lessonId: 'zz', blockId: 'b1', position: 1 }),
      ),
    ).toMatch(/^There is no lesson/);
  });
});

describe('set_blocks', () => {
  it('keeps, rewrites in place, adds and drops blocks in one call', async () => {
    const { state, text } = await ok(
      call(toolState(), 'set_blocks', {
        lessonId: 'l1',
        blocks: [
          { keep: 'b3' },
          { id: 'b1', type: 'markdown', md: 'Commit small changes.' },
          { type: 'callout', tone: 'tip', md: 'Write a clear message.' },
          { id: 'b2', type: 'code', lang: 'bash', code: 'git commit', highlight: '1' },
        ],
      }),
    );
    const blocks = blocksOf(state, 'l1');
    expect(blocks.map((b) => b.id).slice(0, 2)).toEqual(['b3', 'b1']);
    expect(blocks[1]).toEqual({ type: 'markdown', id: 'b1', md: 'Commit small changes.' });
    expect(blocks[2]).toMatchObject({ type: 'callout', tone: 'tip' });
    expect(blocks[2]?.id).toMatch(/^b-/);
    expect(blocks[3]).toMatchObject({
      id: 'b2',
      code: 'git commit',
      copy: true,
      terminal: true,
      highlight: '1',
    });
    expect(blocks[0]).toEqual(blocksOf(toolState(), 'l1')[2]);
    expect(text).toMatch(/^Set 4 blocks \(ids in order: b3, b1, b-[0-9a-f]{8}, b2\); 1 removed\.$/);
  });

  it('says which field a rewritten block is missing, not that it is not a keep', async () => {
    const set = (blocks: unknown[]) =>
      refused(call(toolState(), 'set_blocks', { lessonId: 'l1', blocks }));
    expect(await set([{ type: 'check', id: 'b4', explanation: 'Snapshots, always.' }])).toBe(
      'The input for set_blocks is not valid. In block 1 (check), prompt is missing.',
    );
    expect(await set([{ type: 'code', id: 'b2', code: 'git log' }])).toBe(
      'The input for set_blocks is not valid. In block 1 (code), lang is missing.',
    );
  });

  it('can empty a lesson', async () => {
    const { state } = await ok(call(toolState(), 'set_blocks', { lessonId: 'l1', blocks: [] }));
    expect(blocksOf(state, 'l1')).toEqual([]);
  });

  it('refuses ids that are not in the lesson, listed twice or of another type', async () => {
    const set = (blocks: unknown[]) =>
      refused(call(toolState(), 'set_blocks', { lessonId: 'l1', blocks }));
    expect(await set([{ keep: 'b5' }])).toBe(
      'Entry 1: Lesson "l1" has no block "b5". Call get_item to see its blocks. Leave id out for a new block.',
    );
    expect(await set([{ keep: 'b1' }, { id: 'b1', type: 'markdown', md: 'x' }])).toBe(
      'Entry 2: block "b1" is listed twice.',
    );
    expect(await set([{ id: 'b1', type: 'code', lang: 'bash', code: 'x' }])).toBe(
      'Entry 1: block "b1" is a markdown block. Give type markdown, or leave id out to make a new block.',
    );
  });

  it('refuses a check whose right answer is missing, new or rewritten', async () => {
    const set = (blocks: unknown[]) =>
      refused(call(toolState(), 'set_blocks', { lessonId: 'l1', blocks }));
    const check = { type: 'check', prompt: 'P', options: ['A', 'B'], correct: 4, explanation: 'E' };
    expect(await set([check])).toBe(
      'Entry 1: correct must be an index from 0 to 1, one of the 2 options.',
    );
    expect(await set([{ ...check, id: 'b4' }])).toBe(
      'Entry 1: correct must be an index from 0 to 1, one of the 2 options.',
    );
  });

  it('refuses a check block written before it had a right answer, until one is given', async () => {
    const state = toolState();
    const check = blocksOf(state, 'l1')[3];
    if (check?.type === 'check') delete check.correct;
    expect(
      await refused(
        call(state, 'update_block', { lessonId: 'l1', blockId: 'b4', changes: { prompt: 'Why?' } }),
      ),
    ).toBe('correct must be an index from 0 to 1, one of the 2 options.');
  });

  it('refuses a Quiz', async () => {
    expect(await refused(call(toolState(), 'set_blocks', { lessonId: 'q1', blocks: [] }))).toMatch(
      /is a Quiz/,
    );
  });
});
