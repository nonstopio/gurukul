import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Block } from '@gurukul/schema';
import { BlockView, Prose } from '../src/player/blocks';
import { axeViolations } from './axe';

const show = (block: unknown) => render(<BlockView block={block as Block} />);

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

  it('lets a learner check an ungraded question and reveals the explanation', () => {
    show({
      type: 'check',
      id: 'k',
      prompt: 'Which?',
      options: ['One', 'Two'],
      explanation: 'Because two.',
    });
    const reveal = screen.getByRole('button', { name: 'Show the answer' }) as HTMLButtonElement;
    expect(reveal.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Two/));
    fireEvent.click(reveal);
    expect(screen.getByRole('status').textContent).toBe('Because two.');
    expect(screen.queryByRole('button', { name: 'Show the answer' })).toBeNull();
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
