import { describe, expect, it } from 'vitest';
import type { Block } from '@gurukul/schema';
import { linksIn } from '../src/studio/session/tools';
import { normalLink, videoProvider } from '../src/studio/session/tools/media';
import { workProblem } from '../src/studio/session/tools/issues';
import {
  call,
  lessonOf,
  must,
  ok,
  refused,
  toolCtx,
  toolState,
  toolWork,
} from './session-tools-fixture';
import type { SessionState } from '../src/studio/session/tools';

const blocksOf = (state: SessionState, id: string): Block[] => {
  const lesson = lessonOf(state, id);
  if (lesson?.type !== 'lesson') throw new Error('not a lesson');
  return lesson.blocks;
};

const YOUTUBE = 'https://youtu.be/abc123';
const LOOM = 'https://www.loom.com/share/0f1e2d3c';
const DRIVE = 'https://drive.google.com/file/d/1AbC_dEf/view';
const PICTURE = 'https://pictures.example/rebase.png';
const SANDBOX = 'https://codesandbox.io/s/rebase-demo';

/** A context where the Educator typed these messages in the chat. */
const pasted = (...messages: string[]) => toolCtx({ educatorLinks: linksIn(messages) });

const notGiven = (where: string) =>
  `Nothing was changed: ${where} links to an address the Educator did not give in this session's chat. Use only a link the Educator typed, exactly as given; never one you made up, found in a source file or wrote yourself. Otherwise call add_todo to ask for it, saying what and where.`;

describe('linksIn', () => {
  it('finds every web address the Educator typed, without the punctuation after it', () => {
    const found = linksIn([
      `Add this after the intro: ${YOUTUBE}.`,
      `Two: ${LOOM}, and (${DRIVE}) or <${SANDBOX}>!`,
      `**${PICTURE}**; see [the book](https://git-scm.com/book)`,
      'The language: https://en.wikipedia.org/wiki/Rust_(language). Done?',
      'Plain http://intranet.example/x?',
    ]);
    expect([...found]).toEqual([
      YOUTUBE,
      LOOM,
      DRIVE,
      SANDBOX,
      PICTURE,
      'https://git-scm.com/book',
      'https://en.wikipedia.org/wiki/Rust_(language)',
      'http://intranet.example/x',
    ]);
  });

  it('finds nothing in words without an address, or in one that is not a web address', () => {
    expect(
      linksIn(['No link here.', 'youtube.com/watch?v=abc123', 'ftp://files.example/a']),
    ).toEqual(new Set());
    // A match that is only punctuation after the scheme is no address.
    expect(linksIn(['See https://. and http://[x'])).toEqual(new Set());
  });

  it('normalises an address the way both sides are compared', () => {
    expect(normalLink('HTTPS://YouTu.be/abc123')).toBe(YOUTUBE);
    expect(normalLink('mailto:a@example.com')).toBeNull();
    expect(normalLink('not a link')).toBeNull();
  });

  it('works out the video host from the link', () => {
    expect(videoProvider(YOUTUBE)).toBe('youtube');
    expect(videoProvider('https://www.youtube.com/watch?v=abc123')).toBe('youtube');
    expect(videoProvider(LOOM)).toBe('loom');
    expect(videoProvider(DRIVE)).toBe('drive');
    expect(videoProvider('https://vimeo.com/123')).toBeNull();
  });
});

describe('media blocks from a link the Educator gave', () => {
  it('adds a video, an image and an embed whose links the Educator typed', async () => {
    const ctx = pasted(
      `Add this after the intro: ${YOUTUBE}`,
      `And the walkthrough ${LOOM}, the recording ${DRIVE}`,
      `The diagram is at ${PICTURE}. The sandbox: ${SANDBOX}`,
    );
    let state = toolState();
    const inputs = [
      { type: 'video', url: YOUTUBE, title: 'Rebase in two minutes' },
      { type: 'video', url: LOOM, captions: true, caption: 'Asha walks through it' },
      { type: 'video', url: DRIVE },
      { type: 'image', url: PICTURE, alt: 'Commits replayed on main', layout: 'medium' },
      { type: 'embed', url: SANDBOX, title: 'Try a rebase' },
    ];
    for (const block of inputs)
      state = (await ok(call(state, 'add_block', { lessonId: 'l3', block }, ctx))).state;
    const blocks = blocksOf(state, 'l3');
    expect(blocks).toMatchObject([
      {
        type: 'video',
        provider: 'youtube',
        url: YOUTUBE,
        captions: false,
        title: 'Rebase in two minutes',
      },
      {
        type: 'video',
        provider: 'loom',
        url: LOOM,
        captions: true,
        caption: 'Asha walks through it',
      },
      { type: 'video', provider: 'drive', url: DRIVE, captions: false },
      { type: 'image', url: PICTURE, alt: 'Commits replayed on main', layout: 'medium' },
      { type: 'embed', url: SANDBOX, title: 'Try a rebase' },
    ]);
    // The agent never sets an upload or a picture's size: a linked image is sized in Studio.
    expect(blocks[3]).not.toHaveProperty('upload');
    expect(blocks[3]).not.toHaveProperty('width');
  });

  it('adds media in set_blocks too, beside blocks kept as they were', async () => {
    const { state } = await ok(
      call(
        toolState(),
        'set_blocks',
        {
          lessonId: 'l1',
          blocks: [{ keep: 'b1' }, { type: 'video', url: YOUTUBE }, { keep: 'b3' }],
        },
        pasted(`Use ${YOUTUBE} after the first block.`),
      ),
    );
    expect(blocksOf(state, 'l1').map((b) => b.type)).toEqual(['markdown', 'video', 'image']);
  });

  it('refuses a link the Educator never typed, naming where', async () => {
    for (const block of [
      { type: 'video', url: 'https://youtu.be/invented1' },
      { type: 'image', url: PICTURE, alt: 'Diagram' },
      { type: 'embed', url: SANDBOX, title: 'Sandbox' },
    ])
      expect(
        await refused(
          call(toolState(), 'add_block', { lessonId: 'l2', block }, pasted(`Only: ${YOUTUBE}`)),
        ),
      ).toBe(notGiven('lesson "Branches" (l2), block b-c8aad35b'));
    // With no context links at all (no chat), nothing new is accepted.
    expect(
      await refused(
        call(toolState(), 'set_blocks', {
          lessonId: 'l2',
          blocks: [{ keep: 'b5' }, { type: 'video', url: YOUTUBE }],
        }),
      ),
    ).toMatch(/links to an address the Educator did not give/);
  });

  it('refuses a link only the agent wrote: its own reply is not the Educator’s words', async () => {
    // The runtime builds the links from the Educator's messages only (session-agent tests); here
    // the context holds what an Educator typed, which did not include the agent's link.
    const ctx = pasted('Find a good video on rebasing and add it.');
    expect(
      await refused(
        call(
          toolState(),
          'add_block',
          { lessonId: 'l2', block: { type: 'video', url: YOUTUBE } },
          ctx,
        ),
      ),
    ).toMatch(
      /^Nothing was changed: lesson "Branches" \(l2\), block b-c8aad35b links to an address/,
    );
  });

  it('matches the link as typed, after trailing punctuation and a normal form', async () => {
    const ctx = pasted(`Add (${YOUTUBE}).`);
    for (const url of [YOUTUBE, 'HTTPS://YOUTU.BE/abc123'])
      await ok(
        call(toolState(), 'add_block', { lessonId: 'l2', block: { type: 'video', url } }, ctx),
      );
    expect(
      await refused(
        call(
          toolState(),
          'add_block',
          { lessonId: 'l2', block: { type: 'video', url: `${YOUTUBE}x` } },
          ctx,
        ),
      ),
    ).toMatch(/did not give/);
  });

  it('refuses a video link no player takes, and points at an embed or a to-do', async () => {
    const vimeo = 'https://vimeo.com/123';
    expect(
      await refused(
        call(
          toolState(),
          'add_block',
          { lessonId: 'l2', block: { type: 'video', url: vimeo } },
          pasted(vimeo),
        ),
      ),
    ).toBe(
      'That link is not a YouTube, Loom or Google Drive video Gurukul can play. If its host is on the embed list (YouTube, Loom, Google Drive, CodeSandbox, StackBlitz), add it as an embed block; otherwise call add_todo to ask the Educator.',
    );
  });

  it('refuses an embed from a host not on the list', async () => {
    const other = 'https://jsfiddle.net/x/1';
    expect(
      await refused(
        call(
          toolState(),
          'set_blocks',
          { lessonId: 'l2', blocks: [{ type: 'embed', url: other, title: 'Fiddle' }] },
          pasted(other),
        ),
      ),
    ).toBe(
      'Entry 1: That address is not on the embed list (YouTube, Loom, Google Drive, CodeSandbox, StackBlitz), so learners would see nothing. Call add_todo to ask the Educator instead.',
    );
  });

  it('refuses an image that is not https, or has no alt text', async () => {
    const plain = 'http://pictures.example/a.png';
    expect(
      await refused(
        call(
          toolState(),
          'add_block',
          { lessonId: 'l2', block: { type: 'image', url: plain, alt: 'A' } },
          pasted(plain),
        ),
      ),
    ).toBe(
      'An image link must start with https://. Call add_todo to ask the Educator for one that does.',
    );
    for (const alt of [undefined, '   '])
      expect(
        await refused(
          call(
            toolState(),
            'add_block',
            { lessonId: 'l2', block: { type: 'image', url: PICTURE, alt } },
            pasted(PICTURE),
          ),
        ),
      ).toMatch(/^The input for add_block is not valid\. Alt (is missing|cannot be empty)\./);
  });

  it('still refuses a file block, whatever the Educator pasted', async () => {
    const pdf = 'https://files.example/cheatsheet.pdf';
    expect(
      await refused(
        call(
          toolState(),
          'add_block',
          { lessonId: 'l2', block: { type: 'file', url: pdf, label: 'Cheat sheet' } },
          pasted(pdf),
        ),
      ),
    ).toMatch(/^The input for add_block is not valid\./);
  });

  it('rewrites a media block in place only with its own address', async () => {
    const ctx = pasted(PICTURE);
    const same = await ok(
      call(
        toolState(),
        'set_blocks',
        {
          lessonId: 'l1',
          blocks: [
            { type: 'image', id: 'b3', url: 'https://example.com/diff.png', alt: 'The diff' },
            { type: 'markdown', id: 'b1', md: 'Commit.' },
          ],
        },
        ctx,
      ),
    );
    expect(blocksOf(same.state, 'l1')[0]).toEqual({
      type: 'image',
      id: 'b3',
      url: 'https://example.com/diff.png',
      alt: 'The diff',
    });
    expect(
      await refused(
        call(
          toolState(),
          'set_blocks',
          { lessonId: 'l1', blocks: [{ type: 'image', id: 'b3', url: PICTURE, alt: 'New' }] },
          ctx,
        ),
      ),
    ).toBe(
      'Entry 1: block "b3" keeps its address. Keep it with {"keep": "b3"}, or leave it out and add a new block with the Educator’s link.',
    );
  });

  it('lets an address the course already held move, and update_block never changes one', async () => {
    const state = toolState();
    const l2 = lessonOf(state, 'l2');
    if (l2?.type === 'lesson')
      l2.blocks.push({ type: 'file', id: 'f1', url: 'ftp://files.example/a.pdf', label: 'A' });
    // Moving the lesson keeps every address it holds, a non-web one included.
    await ok(call(state, 'move_item', { itemId: 'l2', chapterId: 'p2', position: 1 }));
    expect(
      await refused(
        call(toolState(), 'update_block', {
          lessonId: 'l1',
          blockId: 'b3',
          changes: { url: PICTURE },
        }),
      ),
    ).toMatch(/^The input for update_block is not valid\./);
  });
});

describe('media the stored draft already held', () => {
  it('puts back a picture removed in this session without the Educator typing its link', async () => {
    const state = toolState();
    const l1 = lessonOf(state, 'l1');
    if (l1?.type !== 'lesson') throw new Error('not a lesson');
    l1.blocks = l1.blocks.filter((b) => b.id !== 'b3');
    const block = { type: 'image', url: 'https://example.com/diff.png', alt: 'Diff view' };
    await ok(call(state, 'add_block', { lessonId: 'l1', block }));
    // A new course has no stored draft: the same address is then new and refused.
    expect(
      await refused(call({ ...state, base: null }, 'add_block', { lessonId: 'l1', block })),
    ).toMatch(/links to an address the Educator did not give/);
  });
});

describe('workProblem and media addresses', () => {
  it('accepts a new address only when it is among the links given', () => {
    const before = toolWork();
    const after = toolWork();
    const lesson = after.course.chapters[0]?.items[1];
    if (lesson?.type === 'lesson')
      lesson.blocks.push({ type: 'embed', id: 'e1', url: SANDBOX, title: 'Sandbox' });
    expect(workProblem(before, after)).toMatch(/block e1 links to an address/);
    expect(workProblem(before, after, linksIn([SANDBOX]))).toBeNull();
    expect(must(lesson)).toBeTruthy();
  });
});
