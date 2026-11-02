import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeBlurHash } from '@gurukul/schema';
import type { Block } from '@gurukul/schema';
import { BlockView, Prose } from '../src/player/blocks';
import { axeViolations } from './axe';

/** A valid hash that decodes to orange. */
const HASH = encodeBlurHash(
  Uint8ClampedArray.from({ length: 64 }, (_, i) => [230, 120, 20, 255][i % 4] as number),
  4,
  4,
);
/** jsdom has no canvas: a stub that draws nothing and hands back a fixed address. */
function stubCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
  })) as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
}

const show = (block: unknown, props: Partial<Parameters<typeof BlockView>[0]> = {}) =>
  render(<BlockView block={block as Block} {...props} />);

describe('Prose', () => {
  it('renders markdown, opens links in a new tab, and drops raw HTML', () => {
    render(<Prose md={'# Hi\n\n[docs](https://git-scm.com)\n\n<script>alert(1)</script>'} />);
    expect(screen.getByRole('heading', { name: 'Hi' })).toBeTruthy();
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(document.querySelector('script')).toBeNull();
  });
});

describe('BlockView', () => {
  it('embeds a video, or links to it when it cannot be embedded', () => {
    const { unmount } = show({
      type: 'video',
      id: 'v',
      provider: 'youtube',
      url: 'https://youtu.be/abc123',
      captions: true,
    });
    expect(document.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123',
    );
    unmount();
    show({
      type: 'video',
      id: 'v',
      provider: 'loom',
      url: 'https://www.loom.com/other',
      captions: false,
    });
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('link', { name: 'Open the video in a new tab' })).toBeTruthy();
  });

  it("uses the block's video title and caption, and hides Copy when copy is false", () => {
    const v = show({
      type: 'video',
      id: 'v',
      provider: 'youtube',
      url: 'https://youtu.be/abc123',
      captions: true,
      title: 'Branching tour',
      caption: 'Watch the first five minutes',
    });
    expect(screen.getByTitle('Branching tour')).toBeTruthy();
    expect(screen.getByText('Watch the first five minutes')).toBeTruthy();
    v.unmount();
    show({ type: 'code', id: 'c', lang: 'sh', code: 'ls', copy: false, terminal: false });
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
    expect(document.querySelector('.file-link svg')).toBeNull();
  });

  it('puts a file icon in the file link', () => {
    show({ type: 'file', id: 'f', url: 'https://x.test/a.pdf', label: 'Cheat sheet' });
    expect(document.querySelector('.file-link svg')).toBeTruthy();
  });

  describe('blur placeholders', () => {
    beforeEach(stubCanvas);
    afterEach(() => vi.restoreAllMocks());
    const upload = (over: object = {}) => ({
      path: 'courses/c1/media/m1.png',
      bytes: 1000,
      contentType: 'image/png',
      name: 'a.png',
      ...over,
    });
    const image = (over: object = {}) => ({
      type: 'image',
      id: 'i',
      url: 'https://x.test/a.png',
      alt: 'A graph',
      width: 1000,
      height: 600,
      ...over,
    });
    const file = (over: object = {}) => ({
      type: 'file',
      id: 'f',
      url: 'https://x.test/a.pdf',
      label: 'Cheat sheet',
      upload: upload({ contentType: 'application/pdf', bytes: 430_080, ...over }),
    });

    it('shows a valid hash behind an uploaded image until it loads', () => {
      const { container } = show(image({ upload: upload({ blurHash: HASH }) }));
      expect(container.querySelector('.g-figure__blur[aria-hidden="true"]')).toBeTruthy();
      fireEvent.load(screen.getByRole('img', { name: 'A graph' }));
      expect(container.querySelector('.g-figure__blur--out')).toBeTruthy();
    });

    it('shows nothing extra for an invalid hash, no hash, or a linked image', () => {
      for (const block of [
        image({ upload: upload({ blurHash: 'not valid' }) }),
        image({ upload: upload() }),
        image(),
      ]) {
        const { container, unmount } = show(block);
        expect(container.querySelector('.g-figure__blur')).toBeNull();
        unmount();
      }
    });

    it('gives an uploaded File block a decorative first-page thumbnail and keeps its text', async () => {
      const { container } = show(file({ blurHash: HASH }));
      const thumb = container.querySelector('.file-link__thumb') as HTMLElement;
      expect(thumb.getAttribute('aria-hidden')).toBe('true');
      expect(thumb.textContent).toBe('');
      expect(thumb.style.backgroundImage).toContain('data:image/png');
      expect(container.querySelector('.file-link svg')).toBeNull();
      expect(screen.getByRole('link', { name: 'Cheat sheet · PDF · 420 KB' })).toBeTruthy();
      expect(await axeViolations(container)).toEqual([]);
    });

    it('keeps the file icon without a hash, with a malformed one, and for a plain link', () => {
      for (const block of [
        file(),
        file({ blurHash: 'nope' }),
        { type: 'file', id: 'f', url: 'https://x.test/a.pdf', label: 'Cheat sheet' },
      ]) {
        const { container, unmount } = show(block);
        expect(container.querySelector('.file-link__thumb')).toBeNull();
        expect(container.querySelector('.file-link svg')).toBeTruthy();
        unmount();
      }
    });
  });

  describe('image layouts', () => {
    const image = (over: object = {}) => ({
      type: 'image',
      id: 'i',
      url: 'https://x.test/a.png',
      alt: 'A graph',
      ...over,
    });
    const figure = () => document.querySelector('figure') as HTMLElement;

    it('renders an existing image as a framed full-column image that does not open', async () => {
      const { container } = show(image());
      expect(figure().className).toContain('g-figure--column');
      expect(figure().className).not.toContain('g-figure--bare');
      expect(screen.queryByRole('button')).toBeNull();
      const img = screen.getByRole('img', { name: 'A graph' });
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('decoding')).toBe('async');
      expect(await axeViolations(container)).toEqual([]);
    });

    it.each(['column', 'medium', 'small'])('renders the %s layout', async (layout) => {
      const { container } = show(image({ layout, caption: 'Figure 1' }));
      expect(figure().className).toContain(`g-figure--${layout}`);
      expect(screen.getByText('Figure 1')).toBeTruthy();
      expect(await axeViolations(container)).toEqual([]);
    });

    it('removes the frame when border is false', () => {
      show(image({ border: false }));
      expect(figure().className).toContain('g-figure--bare');
    });

    it('puts width and height on the image when known', () => {
      show(image({ width: 1600, height: 900 }));
      const img = screen.getByRole('img', { name: 'A graph' });
      expect(img.getAttribute('width')).toBe('1600');
      expect(img.getAttribute('height')).toBe('900');
    });

    it('opens full size in a dialog with the caption and closes on Escape', async () => {
      show(image({ zoom: true, caption: 'Figure 1' }));
      const open = screen.getByRole('button', { name: 'Open full size: A graph' });
      open.focus();
      fireEvent.click(open);
      const dialog = screen.getByRole('dialog', { name: 'A graph' });
      expect(dialog.textContent).toContain('Figure 1');
      expect(await axeViolations(dialog)).toEqual([]);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(open);
    });

    it('shows the alt text in a quiet box when the image does not load', () => {
      show(image({ zoom: true }));
      fireEvent.error(screen.getByRole('img', { name: 'A graph' }));
      expect(screen.queryByRole('img')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.getByText('A graph')).toBeTruthy();
    });
  });

  describe('file label', () => {
    it('reads "Label · PDF · size" for an uploaded PDF and opens it in a new tab', () => {
      show({
        type: 'file',
        id: 'f',
        url: 'https://x.test/a.pdf',
        label: 'Cheat sheet',
        upload: {
          path: 'courses/c1/media/m1.pdf',
          bytes: 430_080,
          contentType: 'application/pdf',
          name: 'cheat.pdf',
        },
      });
      const link = screen.getByRole('link', { name: 'Cheat sheet · PDF · 420 KB' });
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });
  });

  it('shows nothing for a video that is not recorded yet', () => {
    show({
      type: 'video',
      id: 'v',
      provider: 'youtube',
      url: 'https://www.youtube.com/watch?v=TODO_RECORD_VIDEO',
      captions: true,
    });
    expect(screen.queryByText('Video coming soon.')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('renders markdown, with and without a title on a callout', () => {
    const { unmount } = show({ type: 'markdown', id: 'm', md: 'Hello **there**' });
    expect(screen.getByText('there').tagName).toBe('STRONG');
    unmount();
    const c = show({ type: 'callout', id: 'c', tone: 'tip', md: 'Use `git switch`' });
    expect(screen.getByText('Tip')).toBeTruthy();
    c.unmount();
    show({ type: 'callout', id: 'c', tone: 'warning', title: 'Careful', md: 'x' });
    expect(screen.getByText('Careful')).toBeTruthy();
  });

  it('renders code as a terminal or plain code, with an optional file name and highlight', () => {
    const { unmount } = show({
      type: 'code',
      id: 'c',
      lang: 'sh',
      code: 'git status',
      copy: true,
      terminal: true,
    });
    expect(screen.getByText('terminal')).toBeTruthy();
    unmount();
    const reply = show({
      type: 'code',
      id: 'c',
      lang: 'sh',
      code: 'git version 2.47.0',
      copy: false,
      terminal: true,
    });
    expect(screen.getByText('output')).toBeTruthy();
    reply.unmount();
    show({
      type: 'code',
      id: 'c',
      lang: 'ts',
      code: 'a\nb',
      copy: true,
      terminal: false,
      file: 'a.ts',
      highlight: '2',
    });
    expect(screen.getByText('a.ts')).toBeTruthy();
  });

  it('renders an image with an optional caption, and a file link', () => {
    const { unmount } = show({
      type: 'image',
      id: 'i',
      url: 'https://x.test/a.png',
      alt: 'A graph',
      caption: 'Figure 1',
    });
    expect(screen.getByRole('img', { name: 'A graph' })).toBeTruthy();
    expect(screen.getByText('Figure 1')).toBeTruthy();
    unmount();
    const i = show({ type: 'image', id: 'i', url: 'https://x.test/a.png', alt: 'No caption' });
    expect(document.querySelector('figcaption')).toBeNull();
    i.unmount();
    show({ type: 'file', id: 'f', url: 'https://x.test/a.pdf', label: 'Cheat sheet' });
    expect(screen.getByRole('link', { name: 'Cheat sheet' }).getAttribute('rel')).toBe(
      'noopener noreferrer',
    );
  });

  it('embeds only allow-listed hosts', () => {
    const { unmount } = show({
      type: 'embed',
      id: 'e',
      url: 'https://stackblitz.com/edit/x',
      title: 'Playground',
    });
    expect(document.querySelector('iframe')?.getAttribute('title')).toBe('Playground');
    unmount();
    show({ type: 'embed', id: 'e', url: 'https://evil.example/x', title: 'Playground' });
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('link', { name: /Playground/ })).toBeTruthy();
  });

  it('renders inline code in a question, its options and its explanation', () => {
    const { container } = show({
      type: 'check',
      id: 'm',
      prompt: 'What does `--global` do?',
      options: ['Sets it for **every** project', 'Only `this` one'],
      correct: 0,
      explanation: 'Use `--global` once.',
    });
    expect(screen.getByRole('group', { name: 'What does --global do?' })).toBeTruthy();
    expect(container.querySelectorAll('code')).toHaveLength(2);
    fireEvent.click(screen.getByLabelText(/every/));
    expect(container.querySelectorAll('.check__explanation code')).toHaveLength(1);
  });

  it('keeps the words of a link or list in a question, and joins its paragraphs', () => {
    const { container } = show({
      type: 'check',
      id: 'u',
      prompt: 'See [the guide](https://example.com) first:\n\n- one\n- two',
      options: ['Read **it**', 'Skip'],
      explanation: 'First.\n\nSecond.',
    });
    const group = screen.getByRole('group');
    expect(group.textContent).toContain('See the guide first:');
    expect(group.textContent).toContain('one');
    expect(group.textContent).toContain('two');
    expect(container.querySelector('a')).toBeNull();
    fireEvent.click(screen.getByLabelText(/Read/));
    expect(screen.getByRole('status').textContent).toBe('First. Second.');
  });

  it('shows the explanation the moment a learner picks on a question with no key', () => {
    const onAnswered = vi.fn();
    show(
      {
        type: 'check',
        id: 'k',
        prompt: 'Which?',
        options: ['One', 'Two'],
        explanation: 'Because two.',
      },
      { onAnswered },
    );
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByLabelText(/Two/));
    expect(screen.getByRole('status').textContent).toBe('Because two.');
    expect(onAnswered).toHaveBeenCalledWith('k');
  });

  it('marks a wrong pick at once, keeps the other options open and does not count it as answered', () => {
    const onAnswered = vi.fn();
    show(
      {
        type: 'check',
        id: 'k',
        prompt: 'Which?',
        options: ['One', 'Two', 'Three'],
        correct: 1,
        explanation: 'Because two.',
      },
      { onAnswered },
    );
    fireEvent.click(screen.getByLabelText(/One/));
    expect(screen.getByText('Incorrect')).toBeTruthy();
    expect(screen.queryByText('Correct')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Not quite. Try another answer.');
    expect((screen.getByLabelText(/Three/) as HTMLInputElement).disabled).toBe(false);
    expect(onAnswered).not.toHaveBeenCalled();
  });

  it('lets a learner correct a wrong pick: the right one shows the explanation and locks the rest', () => {
    const onAnswered = vi.fn();
    show(
      {
        type: 'check',
        id: 'k',
        prompt: 'Which?',
        options: ['One', 'Two', 'Three'],
        correct: 1,
        explanation: 'Because two.',
      },
      { onAnswered },
    );
    fireEvent.click(screen.getByLabelText(/One/));
    fireEvent.click(screen.getByLabelText(/Two/));
    expect(screen.getByText('Correct')).toBeTruthy();
    expect(screen.queryByText('Incorrect')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Because two.');
    expect((screen.getByLabelText(/Three/) as HTMLInputElement).disabled).toBe(true);
    expect(onAnswered).toHaveBeenCalledTimes(1);
  });

  it('shows a visible notice for a block type it does not know', () => {
    show({ type: 'hologram', id: 'h' });
    expect(screen.getByRole('note').textContent).toContain('newer version');
  });

  it('shows the same notice for a block the course reader could not read', () => {
    show({ type: 'unsupported', id: 'u' });
    expect(screen.getByRole('note').textContent).toContain('newer version');
  });

  it('has no axe violations for a lesson of mixed blocks', async () => {
    const { container } = render(
      <>
        <BlockView block={{ type: 'markdown', id: 'm', md: '## Title\n\ntext' }} />
        <BlockView
          block={{
            type: 'check',
            id: 'k',
            prompt: 'Which?',
            options: ['One', 'Two'],
            explanation: 'x',
          }}
        />
        <BlockView
          block={{ type: 'code', id: 'c', lang: 'sh', code: 'ls', copy: true, terminal: true }}
        />
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
