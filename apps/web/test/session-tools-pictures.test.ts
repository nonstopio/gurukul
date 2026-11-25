import { describe, expect, it } from 'vitest';
import { picturesIn } from '../src/studio/session/tools/pictures';
import { call, lessonOf, ok, refused, toolCtx, toolState } from './session-tools-fixture';

const SHOT = '![shot](https://evil.example/x.png)';
const said = (where: string) =>
  `Nothing was changed: the text of ${where} shows a picture. A picture goes in an image block, never in text: add one with a link the Educator typed in the chat, or call add_todo to ask the Educator, saying what and where.`;

describe('picturesIn', () => {
  it('finds picture addresses the player would load', () => {
    expect(picturesIn(`See ${SHOT}.`)).toEqual(['https://evil.example/x.png']);
    expect(picturesIn('![a][d]\n\n[d]: https://x.example/a.png')).toEqual([
      'https://x.example/a.png',
    ]);
    expect(picturesIn('Before <img src="https://x.example/b.png"> after')).toEqual([
      '<img src="https://x.example/b.png">',
    ]);
  });

  it('leaves text, links, code and references with no definition alone', () => {
    expect(picturesIn('Plain words.')).toEqual([]);
    expect(picturesIn('A [link](https://x.example) and ![not a picture][nowhere].')).toEqual([]);
    expect(picturesIn('Write `![alt](url)` to show a picture.')).toEqual([]);
    expect(picturesIn('```md\n![alt](https://x.example/c.png)\n```')).toEqual([]);
    expect(picturesIn('A <span>tag</span> and <video> in text.')).toEqual(['<video>']);
    expect(picturesIn('<b>bold</b> is fine, <IMG> is not')).toEqual(['<IMG>']);
  });
});

describe('Markdown text never gains a picture', () => {
  it('refuses a picture in a text block or a callout', async () => {
    const where = 'lesson "Branches" (l2), block b-c8aad35b';
    for (const block of [
      { type: 'markdown', md: SHOT },
      { type: 'callout', tone: 'note', md: `Look: ${SHOT}` },
    ])
      expect(await refused(call(toolState(), 'add_block', { lessonId: 'l2', block }))).toBe(
        said(where),
      );
    expect(
      await refused(
        call(toolState(), 'update_block', {
          lessonId: 'l1',
          blockId: 'b1',
          changes: { md: '<img src="https://x.example/d.png">' },
        }),
      ),
    ).toBe(said('lesson "First commit" (l1), block b1'));
    expect(
      await refused(
        call(toolState(), 'set_blocks', {
          lessonId: 'l2',
          blocks: [{ type: 'markdown', id: 'b5', md: SHOT }],
        }),
      ),
    ).toBe(said('lesson "Branches" (l2), block b5'));
  });

  it('refuses a picture in text even when the Educator gave its link: it goes in an image block', async () => {
    const ctx = toolCtx({ educatorLinks: new Set(['https://evil.example/x.png']) });
    expect(
      await refused(
        call(
          toolState(),
          'add_block',
          { lessonId: 'l2', block: { type: 'markdown', md: SHOT } },
          ctx,
        ),
      ),
    ).toBe(said('lesson "Branches" (l2), block b-c8aad35b'));
  });

  it('refuses a picture in the course description', async () => {
    expect(await refused(call(toolState(), 'set_landing', { description: SHOT }))).toBe(
      said('the course description'),
    );
  });

  it('refuses a picture in a check block or a Quiz question', async () => {
    expect(
      await refused(
        call(toolState(), 'update_block', {
          lessonId: 'l1',
          blockId: 'b4',
          changes: { options: ['A snapshot', SHOT] },
        }),
      ),
    ).toBe(said('lesson "First commit" (l1), block b4'));
    expect(
      await refused(
        call(toolState(), 'update_question', { quizId: 'q1', questionId: 'k2', explanation: SHOT }),
      ),
    ).toBe(said('Quiz "History check" (q1), question k2'));
  });

  it('keeps a picture the Educator already wrote, so the text around it can change', async () => {
    const state = toolState();
    const lesson = lessonOf(state, 'l2');
    if (lesson?.type === 'lesson') lesson.blocks[0] = { type: 'markdown', id: 'b5', md: SHOT };
    const { state: next } = await ok(
      call(state, 'update_block', {
        lessonId: 'l2',
        blockId: 'b5',
        changes: { md: `A branch is a pointer.\n\n${SHOT}` },
      }),
    );
    expect(lessonOf(next, 'l2')).toMatchObject({
      blocks: [{ md: `A branch is a pointer.\n\n${SHOT}` }],
    });
    expect(
      await refused(
        call(state, 'update_block', {
          lessonId: 'l2',
          blockId: 'b5',
          changes: { md: '![other](https://evil.example/y.png)' },
        }),
      ),
    ).toBe(said('lesson "Branches" (l2), block b5'));
  });
});
