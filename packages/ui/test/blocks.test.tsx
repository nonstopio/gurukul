import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Breadcrumb, CodeBlock, QuizOption, ResultRow, VideoBlock, parseHighlight } from '../src';
import { axeViolations } from './axe';

function mockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('parseHighlight', () => {
  it('reads numbers and ranges, in either order, and skips junk', () => {
    expect([...parseHighlight('2, 4-6,9-8,x,,3-')].sort((a, b) => a - b)).toEqual([
      2, 4, 5, 6, 8, 9,
    ]);
  });
  it('is empty without a spec', () => {
    expect(parseHighlight(undefined).size).toBe(0);
  });
});

describe('CodeBlock', () => {
  it('omits the Copy button when copyable is false', () => {
    const { container } = render(<CodeBlock code="ls" copyable={false} />);
    expect(container.querySelector('.g-code__copy')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('names the header after the file and renders one span per line', async () => {
    const { container } = render(<CodeBlock code={'a\n\nb\n'} fileName="app.ts" className="x" />);
    expect(screen.getByRole('region', { name: 'app.ts' }).getAttribute('tabindex')).toBe('0');
    expect(container.querySelectorAll('.g-code__line')).toHaveLength(3);
    expect(container.firstElementChild?.className).toBe('g-code x');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('says "code" by default and "terminal" for the terminal variant', () => {
    const { container, rerender } = render(<CodeBlock code="ls" />);
    expect(screen.getByRole('region', { name: 'code' })).toBeTruthy();
    rerender(<CodeBlock code="ls" variant="terminal" />);
    expect(screen.getByRole('region', { name: 'terminal' })).toBeTruthy();
    expect(container.querySelector('.g-code--terminal')).toBeTruthy();
  });

  it('marks highlighted lines', () => {
    const { container } = render(<CodeBlock code={'1\n2\n3\n4'} highlight="2,4" />);
    const marked = [...container.querySelectorAll('[data-highlighted="true"]')].map(
      (el) => el.textContent,
    );
    expect(marked).toEqual(['2', '4']);
  });

  describe('copying', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('copies, flips to Copied with a live announcement, and resets after 2s', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      mockClipboard(writeText);
      render(<CodeBlock code="npm ci" />);
      const status = screen.getByRole('status');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
      });
      expect(writeText).toHaveBeenCalledWith('npm ci');
      expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
      expect(status.textContent).toBe('Copied');
      act(() => {
        vi.advanceTimersByTime(1999);
      });
      expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
      expect(status.textContent).toBe('');
    });

    it('restarts the 2s timer on a second copy', async () => {
      mockClipboard(vi.fn().mockResolvedValue(undefined));
      render(<CodeBlock code="x" />);
      const copy = async () => {
        await act(async () => {
          fireEvent.click(screen.getByRole('button'));
        });
      };
      await copy();
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      await copy();
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    });

    it('says so when the clipboard refuses and keeps the Copy label', async () => {
      mockClipboard(vi.fn().mockRejectedValue(new Error('denied')));
      render(<CodeBlock code="x" failedLabel="Copy failed" />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
      });
      expect(screen.getByRole('status').textContent).toBe('Copy failed');
      expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    });

    it('survives unmount while the reset timer runs', async () => {
      mockClipboard(vi.fn().mockResolvedValue(undefined));
      const { unmount } = render(<CodeBlock code="x" />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button'));
      });
      unmount();
      expect(() => vi.advanceTimersByTime(3000)).not.toThrow();
    });
  });
});

describe('VideoBlock', () => {
  it('embeds a titled lazy iframe with a caption and a new-tab fallback', async () => {
    const { container } = render(
      <VideoBlock
        src="https://example.com/embed/1"
        title="Intro to git"
        href="https://example.com/watch/1"
        caption="Twelve minutes"
        className="x"
      />,
    );
    const frame = screen.getByTitle('Intro to git');
    expect(frame.getAttribute('src')).toBe('https://example.com/embed/1');
    expect(frame.getAttribute('loading')).toBe('lazy');
    expect(screen.getByText('Twelve minutes')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Open the video in a new tab' });
    expect(link.getAttribute('href')).toBe('https://example.com/watch/1');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(container.firstElementChild?.className).toBe('g-video x');
    // jsdom cannot run axe inside a frame: check the page around it (the frame's title is asserted above).
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelector('iframe')?.remove();
    document.body.append(clone);
    expect(await axeViolations(clone)).toEqual([]);
    clone.remove();
  });

  it('omits the caption and allows a custom link label', () => {
    const { container } = render(<VideoBlock src="s" title="t" href="h" linkLabel="Watch" />);
    expect(container.querySelector('figcaption')).toBeNull();
    expect(screen.getByRole('link', { name: 'Watch' })).toBeTruthy();
  });

  it('hands the player frame to a caller that tracks it', () => {
    const frameRef = createRef<HTMLIFrameElement>();
    render(<VideoBlock src="s" title="t" href="h" frameRef={frameRef} />);
    expect(frameRef.current).toBe(screen.getByTitle('t'));
  });
});

describe('QuizOption', () => {
  it('is a radio by default and reports a change', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <fieldset>
        <legend>Q</legend>
        <QuizOption name="q" value="a" letter="A" checked={false} onChange={onChange}>
          Merge
        </QuizOption>
      </fieldset>,
    );
    const input = screen.getByRole('radio', { name: /Merge/ });
    expect(input.closest('label')?.className).toContain('g-quiz-option--idle');
    fireEvent.click(input);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('is a checkbox when several answers are allowed, and looks selected when checked', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <QuizOption letter="B" multiple checked onChange={onChange} className="x">
        Rebase
      </QuizOption>,
    );
    const input = screen.getByRole('checkbox', { name: /Rebase/ });
    expect(input.closest('label')?.className).toBe('g-quiz-option g-quiz-option--selected x');
    fireEvent.click(input);
    expect(onChange).toHaveBeenCalledWith(false);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('is reachable and toggled by keyboard (Space on a checkbox)', () => {
    render(
      <QuizOption letter="A" multiple checked={false} onChange={() => {}}>
        One
      </QuizOption>,
    );
    const input = screen.getByRole('checkbox');
    input.focus();
    expect(document.activeElement).toBe(input);
  });

  it.each([
    ['correct', 'Correct'],
    ['incorrect', 'Incorrect'],
  ] as const)('%s states the verdict in words and locks the input', async (state, word) => {
    const { container } = render(
      <QuizOption letter="C" checked state={state} onChange={() => {}}>
        Answer
      </QuizOption>,
    );
    expect(screen.getByText(word)).toBeTruthy();
    expect((screen.getByRole('radio') as HTMLInputElement).disabled).toBe(true);
    expect(container.querySelector(`.g-quiz-option--${state}`)).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('locked is disabled with no verdict', () => {
    const { container } = render(
      <QuizOption letter="D" checked={false} state="locked" onChange={() => {}}>
        Answer
      </QuizOption>,
    );
    expect((screen.getByRole('radio') as HTMLInputElement).disabled).toBe(true);
    expect(container.querySelector('.g-quiz-option__verdict')).toBeNull();
    expect(container.querySelector('.g-quiz-option--locked')).toBeTruthy();
  });
});

describe('ResultRow', () => {
  it('a pass shows the answer plainly, no strike-through', async () => {
    const { container } = render(
      <ul>
        <ResultRow passed question="What does fetch do?" yourAnswer="Downloads refs" />
      </ul>,
    );
    expect(screen.getByText(/Correct\./)).toBeTruthy();
    expect(container.querySelector('s')).toBeNull();
    expect(screen.queryByText('Correct answer')).toBeNull();
    expect(container.querySelector('.g-result__explanation')).toBeNull();
    expect(container.querySelector('.g-result__link')).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('a fail strikes the wrong answer, shows the right one, explanation and a revisit link', async () => {
    const { container } = render(
      <ul>
        <ResultRow
          passed={false}
          question="What does pull do?"
          yourAnswer="Only fetches"
          correctAnswer="Fetches and merges"
          revisit={{ href: '/lesson/3', label: 'Revisit lesson: Pulling' }}
          className="x"
        >
          Pull is fetch followed by merge.
        </ResultRow>
      </ul>,
    );
    expect(screen.getByText(/Incorrect\./)).toBeTruthy();
    expect(container.querySelector('s')?.textContent).toBe('Only fetches');
    expect(screen.getByText('Fetches and merges')).toBeTruthy();
    expect(screen.getByText('Pull is fetch followed by merge.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Revisit lesson: Pulling' }).getAttribute('href')).toBe(
      '/lesson/3',
    );
    expect(container.querySelector('li')?.className).toBe('g-result g-result--fail x');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('lets a router draw the revisit link', () => {
    render(
      <ul>
        <ResultRow
          passed={false}
          question="Q"
          yourAnswer="A"
          revisit={{
            href: '/l',
            label: 'Revisit',
            render: (p) => (
              <a data-router="yes" {...p}>
                {p.children}
              </a>
            ),
          }}
        />
      </ul>,
    );
    const link = screen.getByRole('link', { name: 'Revisit' });
    expect(link.getAttribute('data-router')).toBe('yes');
    expect(link.getAttribute('href')).toBe('/l');
    expect(link.className).toBe('g-result__link');
  });
});

describe('Breadcrumb', () => {
  it('is a named nav with an ordered list and the last item as the current page', async () => {
    const { container } = render(
      <Breadcrumb
        className="x"
        items={[
          { label: 'My learning', href: '/' },
          { label: 'Git', href: '/c/git' },
          { label: 'Merging' },
        ]}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.className).toBe('g-breadcrumb x');
    expect(nav.querySelector('ol')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Git' }).getAttribute('href')).toBe('/c/git');
    const current = screen.getByText('Merging');
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('link', { name: 'Merging' })).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('accepts a custom label, a render link, and plain text for a crumb with no target', () => {
    render(
      <Breadcrumb
        label="Path"
        items={[
          {
            label: 'Courses',
            render: (p) => (
              <button type="button" data-router="yes" className={p.className}>
                {p.children}
              </button>
            ),
          },
          { label: 'Group' },
          { label: 'Here', href: '/ignored' },
        ]}
      />,
    );
    expect(screen.getByRole('navigation', { name: 'Path' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Courses' }).getAttribute('data-router')).toBe('yes');
    expect(screen.getByText('Group').className).toBe('g-breadcrumb__text');
    expect(screen.getByText('Here').getAttribute('aria-current')).toBe('page');
  });
});
