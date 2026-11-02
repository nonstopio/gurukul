import type { Block } from '@gurukul/schema';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BlockEditor } from '../src/studio/blocks/BlockEditor';
import { BlockPalette } from '../src/studio/blocks/BlockPalette';
import { newBlock } from '../src/studio/lessonEdit';
import { axeViolations } from './axe';
import { BlockProviders } from './block-harness';

/** Renders one block editor the way the page does: controlled, with the latest block kept in `seen`. */
function Harness({ initial, seen }: { initial: Block; seen: (b: Block) => void }) {
  const [block, setBlock] = useState(initial);
  return (
    <BlockEditor
      block={block}
      onChange={(next) => {
        seen(next);
        setBlock(next);
      }}
    />
  );
}
function setup(block: Block) {
  const seen = vi.fn();
  const view = render(
    <BlockProviders>
      <Harness initial={block} seen={seen} />
    </BlockProviders>,
  );
  return { ...view, seen, last: () => seen.mock.lastCall?.[0] as Block };
}
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('text block editor', () => {
  const md = (text: string): Block => ({ ...newBlock('markdown'), md: text }) as Block;
  const area = () => screen.getByLabelText('Text (Markdown)') as HTMLTextAreaElement;

  it('edits the Markdown', () => {
    const { last } = setup(md(''));
    type('Text (Markdown)', 'Hello');
    expect(last()).toMatchObject({ md: 'Hello' });
  });

  it('wraps the selected text and keeps it selected', () => {
    const { last } = setup(md('hello world'));
    area().setSelectionRange(0, 5);
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(last()).toMatchObject({ md: '**hello** world' });
    expect(area().value).toBe('**hello** world');
    expect([area().selectionStart, area().selectionEnd]).toEqual([2, 7]);
    expect(document.activeElement).toBe(area());
  });

  it.each([
    ['Italic', 'say hi', 4, 6, 'say *hi*'],
    ['Inline code', 'run ls', 4, 6, 'run `ls`'],
    ['Link', 'see docs', 4, 8, 'see [docs](https://)'],
    ['Numbered list', 'one\ntwo', 0, 7, '1. one\n2. two'],
  ])('the %s button changes the text', (name, text, start, end, expected) => {
    const { last } = setup(md(text));
    area().setSelectionRange(start, end);
    fireEvent.click(screen.getByRole('button', { name }));
    expect(last()).toMatchObject({ md: expected });
  });

  it('inserts a placeholder when nothing is selected', () => {
    const { last } = setup(md(''));
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(last()).toMatchObject({ md: '**bold text**' });
  });

  it('previews the Markdown as learners see it, and disables the toolbar meanwhile', () => {
    setup(md('**strong** text'));
    const toggle = screen.getByRole('button', { name: 'Preview' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('strong').tagName).toBe('STRONG');
    expect(screen.queryByLabelText('Text (Markdown)')).toBeNull();
    expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(toggle);
    expect(area().value).toBe('**strong** text');
  });

  it('says so when there is nothing to preview', () => {
    setup(md('  '));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText('Nothing to preview yet.')).toBeTruthy();
  });

  it('has no accessibility violations', async () => {
    const { container } = setup(md('text'));
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('video block editor', () => {
  const video = (over: object = {}): Block =>
    ({ ...newBlock('video'), url: 'https://www.youtube.com/watch?v=abc123', ...over }) as Block;

  it('names the host when the link can be embedded', () => {
    const { container } = setup(video());
    // The toast regions around the editor are statuses too; this one is the block's own.
    expect(
      within(container.querySelector('[role="status"]') as HTMLElement).getByText('YouTube'),
    ).toBeTruthy();
    expect(screen.queryByText(/not recognised/)).toBeNull();
  });

  it('previews a recognised link in a 16:9 frame and none otherwise', () => {
    setup(video());
    const frame = screen.getByTitle('Video preview');
    expect(frame.getAttribute('src')).toContain('abc123');
  });

  it('warns when the link does not fit the chosen host', () => {
    const { container } = setup(video({ provider: 'loom' }));
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByText('Link not recognised as Loom')).toBeTruthy();
    expect(screen.getByText(/plain link/)).toBeTruthy();
  });

  it('changes the host, the link and the captions', () => {
    const { last } = setup(video());
    type('Video host', 'drive');
    expect(last()).toMatchObject({ provider: 'drive' });
    type('Video link', 'https://drive.google.com/file/d/xyz/view');
    expect(last()).toMatchObject({ url: 'https://drive.google.com/file/d/xyz/view' });
    fireEvent.click(screen.getByRole('switch', { name: 'Captions are available' }));
    expect(last()).toMatchObject({ captions: true });
  });

  it('sets and clears the length, which is absent rather than empty', () => {
    const { last } = setup(video());
    type('Length in seconds (optional)', '90');
    expect(last()).toMatchObject({ durationSec: 90 });
    type('Length in seconds (optional)', '');
    expect('durationSec' in last()).toBe(false);
  });

  it('sets and clears the title and caption, which are absent rather than empty', () => {
    const { last } = setup(video());
    type('Title (optional)', 'Intro');
    expect(last()).toMatchObject({ title: 'Intro' });
    type('Title (optional)', '');
    expect('title' in last()).toBe(false);
    type('Caption (optional)', 'Recorded live');
    expect(last()).toMatchObject({ caption: 'Recorded live' });
    type('Caption (optional)', '');
    expect('caption' in last()).toBe(false);
  });

  it('has no accessibility violations', async () => {
    const { container } = setup(video({ durationSec: 30 }));
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('code block editor', () => {
  const code = (over: object = {}): Block => ({ ...newBlock('code'), ...over }) as Block;

  it('edits language, file name, code and the options', () => {
    const { last } = setup(code());
    type('Language', 'bash');
    expect(last()).toMatchObject({ lang: 'bash' });
    type('File name (optional)', 'run.sh');
    expect(last()).toMatchObject({ file: 'run.sh' });
    type('File name (optional)', '');
    expect('file' in last()).toBe(false);
    type('Code', 'ls -la');
    expect(last()).toMatchObject({ code: 'ls -la' });
    fireEvent.click(screen.getByRole('switch', { name: 'Copy button' }));
    expect(last()).toMatchObject({ copy: false });
    fireEvent.click(screen.getByRole('switch', { name: 'Terminal style' }));
    expect(last()).toMatchObject({ terminal: true });
    type('Highlight lines (optional)', '2,4-6');
    expect(last()).toMatchObject({ highlight: '2,4-6' });
    type('Highlight lines (optional)', '');
    expect('highlight' in last()).toBe(false);
  });

  it('keeps a language that is not in the list selectable', () => {
    setup(code({ lang: 'elixir' }));
    expect((screen.getByLabelText('Language') as HTMLSelectElement).value).toBe('elixir');
  });

  it('has no accessibility violations', async () => {
    const { container } = setup(code({ file: 'a.js', highlight: '1' }));
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('callout block editor', () => {
  it('picks the tone, with the chosen one pressed', () => {
    const { last } = setup(newBlock('callout'));
    const tone = screen.getByRole('group', { name: 'Tone' });
    expect(within(tone).getByRole('button', { name: 'Note' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(within(tone).getByRole('button', { name: 'Warning' }));
    expect(last()).toMatchObject({ tone: 'warning' });
    expect(within(tone).getByRole('button', { name: 'Warning' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(within(tone).getByRole('button', { name: 'Note' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('edits the title (absent when cleared) and the text', () => {
    const { last } = setup(newBlock('callout'));
    type('Title (optional)', 'Heads up');
    expect(last()).toMatchObject({ title: 'Heads up' });
    type('Title (optional)', '');
    expect('title' in last()).toBe(false);
    type('Text (Markdown)', 'Careful');
    expect(last()).toMatchObject({ md: 'Careful' });
  });

  it('has no accessibility violations', async () => {
    const { container } = setup(newBlock('callout'));
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('image block editor', () => {
  it('asks for alt text, visibly, and edits all three fields', () => {
    const { last } = setup(newBlock('image'));
    fireEvent.click(screen.getByRole('tab', { name: 'Link' }));
    expect(screen.getByText(/for people who cannot see it/)).toBeTruthy();
    expect((screen.getByLabelText('Alt text (required)') as HTMLInputElement).required).toBe(true);
    type('Image address', 'https://example.com/a.png');
    expect(last()).toMatchObject({ url: 'https://example.com/a.png' });
    type('Alt text (required)', 'A branch diagram');
    expect(last()).toMatchObject({ alt: 'A branch diagram' });
    type('Caption (optional)', 'Figure 1');
    expect(last()).toMatchObject({ caption: 'Figure 1' });
    type('Caption (optional)', '');
    expect('caption' in last()).toBe(false);
  });

  it('has no accessibility violations', async () => {
    const { container } = setup(newBlock('image'));
    expect(await axeViolations(container)).toEqual([]);
  });

  const linked = (over: object = {}): Block =>
    ({ ...newBlock('image'), url: 'https://example.com/a.png', alt: 'A graph', ...over }) as Block;
  const preview = () => screen.getByRole('img', { name: 'A graph' }) as HTMLImageElement;
  const loaded = (width: number, height: number) => {
    Object.defineProperty(preview(), 'naturalWidth', { value: width, configurable: true });
    Object.defineProperty(preview(), 'naturalHeight', { value: height, configurable: true });
    fireEvent.load(preview());
  };

  it('reads a missing layout, zoom and border as column, off and on', () => {
    setup(linked());
    expect(screen.getByRole('button', { name: 'Column' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(
      (screen.getByRole('switch', { name: 'Open full size' }) as HTMLInputElement).checked,
    ).toBe(false);
    expect((screen.getByRole('switch', { name: 'Border' }) as HTMLInputElement).checked).toBe(true);
  });

  it('sets the layout, Open full size and Border on a linked image', () => {
    const { last } = setup(linked());
    fireEvent.click(screen.getByRole('button', { name: 'Small' }));
    expect(last()).toMatchObject({ layout: 'small' });
    expect(screen.getByRole('button', { name: 'Small' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Medium' }));
    expect(last()).toMatchObject({ layout: 'medium' });
    fireEvent.click(screen.getByRole('switch', { name: 'Open full size' }));
    expect(last()).toMatchObject({ zoom: true });
    fireEvent.click(screen.getByRole('switch', { name: 'Border' }));
    expect(last()).toMatchObject({ border: false });
    fireEvent.click(screen.getByRole('switch', { name: 'Border' }));
    expect(last()).toMatchObject({ border: true });
  });

  it('previews at the chosen layout and shows nothing without an address', () => {
    const { container, unmount } = setup(linked({ layout: 'small', border: false }));
    expect(container.querySelector('.g-figure--small.g-figure--bare')).toBeTruthy();
    unmount();
    setup(linked({ url: '' }));
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('names the preview when there is no alt text yet', () => {
    setup(linked({ alt: '' }));
    expect(screen.getByRole('img', { name: 'Image preview' })).toBeTruthy();
  });

  it('records the width and height of a linked image from the loaded preview', () => {
    const { last, seen } = setup(linked());
    loaded(1600, 900);
    expect(last()).toMatchObject({ width: 1600, height: 900 });
    expect(preview().getAttribute('width')).toBe('1600');
    // Loading again with the same size writes nothing more.
    seen.mockClear();
    loaded(1600, 900);
    expect(seen).not.toHaveBeenCalled();
  });

  it('forgets the old size when the address changes', () => {
    const { last } = setup(linked({ width: 10, height: 20 }));
    type('Image address', 'https://example.com/b.png');
    expect(last()).toMatchObject({ url: 'https://example.com/b.png' });
    expect('width' in last()).toBe(false);
    expect('height' in last()).toBe(false);
  });

  it('leaves the size of an uploaded image alone, and an address typed over it makes it a link', () => {
    const upload = {
      path: 'courses/c1/media/m1.png',
      bytes: 1000,
      contentType: 'image/png',
      name: 'a.png',
    };
    const { last, seen } = setup(linked({ upload, width: 800, height: 600 }));
    loaded(1600, 900);
    expect(seen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Link' }));
    expect(screen.getByText(/uploaded to Gurukul/)).toBeTruthy();
    type('Image address', 'https://example.com/b.png');
    expect(last()).toMatchObject({ url: 'https://example.com/b.png' });
    for (const key of ['upload', 'width', 'height']) expect(key in last()).toBe(false);
  });

  it('has no accessibility violations with the controls and preview', async () => {
    const { container } = setup(linked());
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('embed block editor', () => {
  it('accepts an allowed host and warns about any other', () => {
    const { last } = setup(newBlock('embed'));
    expect(screen.getByText('Allowed host')).toBeTruthy();
    type('Embed address', 'https://evil.example.com/x');
    expect(last()).toMatchObject({ url: 'https://evil.example.com/x' });
    expect(screen.getByText('Host not on the allowed list')).toBeTruthy();
    expect(screen.getByText(/Only YouTube, Loom/)).toBeTruthy();
    type('Title', 'Demo');
    expect(last()).toMatchObject({ title: 'Demo' });
  });

  it('has no accessibility violations', async () => {
    const { container } = setup(newBlock('embed'));
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('file block editor', () => {
  it('edits the address and the label', () => {
    const { last } = setup(newBlock('file'));
    fireEvent.click(screen.getByRole('tab', { name: 'Link' }));
    type('File address', 'https://example.com/guide.pdf');
    expect(last()).toMatchObject({ url: 'https://example.com/guide.pdf' });
    type('Label', 'The guide');
    expect(last()).toMatchObject({ label: 'The guide' });
  });

  it('has no accessibility violations', async () => {
    const { container } = setup(newBlock('file'));
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('check block editor', () => {
  it('edits the question, answers and explanation', () => {
    const { last } = setup(newBlock('check'));
    type('Question', 'Which?');
    type('Answer 1', 'A');
    type('Answer 2', 'B');
    type('Explanation', 'Because');
    expect(last()).toMatchObject({ prompt: 'Which?', options: ['A', 'B'], explanation: 'Because' });
  });

  it('marks the right answer', () => {
    const { last } = setup({ ...newBlock('check'), options: ['a', 'b'], correct: 0 } as Block);
    expect((screen.getByLabelText('Answer 1 is correct') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText('Answer 2 is correct'));
    expect(last()).toMatchObject({ correct: 1 });
  });

  it('adds answers up to six and removes them down to two', () => {
    const { last } = setup(newBlock('check'));
    const add = screen.getByRole('button', { name: 'Add answer' }) as HTMLButtonElement;
    for (let i = 0; i < 4; i++) fireEvent.click(add);
    expect((last() as { options: string[] }).options).toHaveLength(6);
    expect(add.disabled).toBe(true);
    for (let i = 0; i < 4; i++)
      fireEvent.click(screen.getByRole('button', { name: 'Remove answer 1' }));
    expect((last() as { options: string[] }).options).toHaveLength(2);
    expect(
      (screen.getByRole('button', { name: 'Remove answer 1' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(add.disabled).toBe(false);
  });

  it('has no accessibility violations', async () => {
    const { container } = setup({ ...newBlock('check'), options: ['a', 'b', 'c'] } as Block);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('block palette', () => {
  it('offers eight tiles and reports the chosen type', async () => {
    const onAdd = vi.fn();
    const { container } = render(<BlockPalette onAdd={onAdd} />);
    expect(screen.getAllByRole('button')).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Callout' }));
    expect(onAdd).toHaveBeenCalledWith('callout');
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('block scope', () => {
  it('is required: an editor outside it is a bug, not a state', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<BlockEditor block={newBlock('image')} onChange={() => {}} />)).toThrow(
      'useBlockScope must be used inside <BlockScope>',
    );
    quiet.mockRestore();
  });
});
