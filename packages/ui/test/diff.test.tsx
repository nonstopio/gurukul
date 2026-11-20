import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  DiffCode,
  DiffFields,
  DiffMedia,
  DiffNote,
  DiffRow,
  DiffText,
  DiffUnchanged,
  DiffView,
  type DiffTextPart,
} from '../src';
import { axeViolations } from './axe';

const WORDS: DiffTextPart[] = [
  { op: 'same', text: 'Rebase ' },
  { op: 'removed', text: 'before you raise' },
  { op: 'added', text: 'before you open' },
  { op: 'same', text: ' a pull request.' },
  { op: 'added', text: '  ' },
];

describe('DiffText', () => {
  it('strikes removed words and underlines added ones, each named for a screen reader', async () => {
    const { container } = render(
      <p>
        <DiffText parts={WORDS} className="x" />
      </p>,
    );
    const text = container.querySelector('.g-diff-text') as HTMLElement;
    expect(text.className).toBe('g-diff-text x');
    const del = text.querySelector('del') as HTMLElement;
    const ins = text.querySelector('ins') as HTMLElement;
    expect(del.textContent).toBe('removed: before you raise');
    expect(ins.textContent).toBe('added: before you open');
    // A run of spaces alone is not marked.
    expect(text.querySelectorAll('ins')).toHaveLength(1);
    expect(text.textContent).toBe(
      'Rebase removed: before you raiseadded: before you open a pull request.  ',
    );
    expect(await axeViolations(container)).toEqual([]);
  });

  it('draws one side: before keeps removed words, after keeps added ones', () => {
    const { container, rerender } = render(<DiffText parts={WORDS} side="before" />);
    expect(container.textContent).toBe('Rebase removed: before you raise a pull request.');
    rerender(<DiffText parts={WORDS} side="after" />);
    expect(container.textContent).toBe('Rebase added: before you open a pull request.  ');
  });
});

describe('DiffCode', () => {
  const LINES: DiffTextPart[] = [
    { op: 'same', text: 'git fetch origin\n' },
    { op: 'removed', text: 'git merge main\n' },
    { op: 'added', text: 'git rebase origin/main\n\nexit' },
  ];

  it('puts − and + in the gutter and says which lines went and came', async () => {
    const { container } = render(<DiffCode parts={LINES} label="Code" className="x" />);
    const pre = screen.getByRole('region', { name: 'Code' });
    expect(pre.querySelector('pre')).not.toBeNull();
    expect(pre.className).toBe('g-diff-code x');
    expect(pre.getAttribute('tabindex')).toBe('0');
    const lines = [...container.querySelectorAll('.g-diff-code__line')];
    expect(
      lines.map((l) => l.className.replace('g-diff-code__line g-diff-code__line--', '')),
    ).toEqual(['same', 'removed', 'added', 'added', 'added']);
    expect(lines.map((l) => l.querySelector('.g-diff-code__sign')?.textContent)).toEqual([
      ' ',
      '−',
      '+',
      '+',
      '+',
    ]);
    expect(lines[0]?.textContent).toBe(' git fetch origin');
    expect(lines[1]?.textContent).toBe('−removed line: git merge main');
    // An empty line keeps its height.
    expect(lines[3]?.textContent).toBe('+added line:  ');
    expect(lines[4]?.textContent).toBe('+added line: exit');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('draws one side', () => {
    const { container, rerender } = render(<DiffCode parts={LINES} label="Code" side="before" />);
    expect(container.querySelectorAll('.g-diff-code__line')).toHaveLength(2);
    rerender(<DiffCode parts={LINES} label="Code" side="after" />);
    expect(container.querySelectorAll('.g-diff-code__line')).toHaveLength(4);
  });
});

describe('DiffFields', () => {
  it('lists values as before → after, "Not set" for a missing one, and a drawn difference', async () => {
    const { container } = render(
      <DiffFields
        className="x"
        items={[
          { label: 'Pass mark', before: '70%', after: '80%' },
          { label: 'Cover image', before: null, after: 'cover.png' },
          { label: 'Title', change: <DiffText parts={WORDS} /> },
        ]}
      />,
    );
    const list = container.querySelector('dl') as HTMLElement;
    expect(list.className).toBe('g-diff-fields x');
    const rows = [...list.querySelectorAll('.g-diff-fields__row')];
    expect(rows[0]?.textContent).toBe('Pass mark70%→ changed to 80%');
    expect(rows[0]?.querySelector('.g-diff-fields__arrow')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(rows[1]?.textContent).toBe('Cover imageNot set→ changed to cover.png');
    expect(rows[2]?.querySelector('del')).not.toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('DiffView and DiffRow', () => {
  it('side by side: a head, then each row with its sign, words and two cells', async () => {
    const { container } = render(
      <DiffView layout="split" label="Lesson 3.2, before and after" className="x">
        <DiffRow
          statuses={['changed', 'moved']}
          what="Text block"
          before={<p>Old</p>}
          after={<p>New</p>}
          merged={<p>Both</p>}
          notes={<DiffNote>Correct answer changed: B → C</DiffNote>}
          className="y"
        />
        <DiffRow statuses={['added']} what="Check block" before={null} after={<p>Added</p>} />
        <DiffRow statuses={['removed']} what="Image block" before={<p>Gone</p>} after={null} />
        <DiffRow what="Code block" before={<p>Same</p>} after={<p>Same</p>} />
        <DiffRow statuses={['moved']} what="Video block" before={<p>V</p>} after={<p>V</p>} same />
      </DiffView>,
    );
    const view = screen.getByRole('group', { name: 'Lesson 3.2, before and after' });
    expect(view.className).toBe('g-diff g-diff--split x');
    expect(view.querySelector('.g-diff__head')?.textContent).toBe('BeforeAfter');
    const changed = screen.getByRole('group', { name: 'changed and moved: Text block' });
    expect(changed.className).toBe('g-diff-row g-diff-row--changed y');
    expect(changed.querySelector('.g-diff-row__label')?.textContent).toBe(
      'Changed · Moved · Text block',
    );
    expect(changed.querySelector('.g-diff-row__label svg')).not.toBeNull();
    expect(within(changed).getByText('Correct answer changed: B → C')).toBeTruthy();
    // Side by side ignores the merged form: both cells, each named for a screen reader.
    expect(within(changed).queryByText('Both')).toBeNull();
    const cells = changed.querySelectorAll('.g-diff-row__cell');
    expect(cells[0]?.textContent).toBe('Before: Old');
    expect(cells[1]?.textContent).toBe('After: New');
    const added = screen.getByRole('group', { name: 'added: Check block' });
    expect(added.querySelector('.g-diff-row__cell--before')?.textContent).toBe(
      'Before: Not there before',
    );
    const removed = screen.getByRole('group', { name: 'removed: Image block' });
    expect(removed.querySelector('.g-diff-row__cell--after')?.textContent).toBe('After: Removed');
    const unchanged = screen.getByRole('group', { name: 'Code block' });
    expect(unchanged.className).toBe('g-diff-row');
    expect(unchanged.querySelector('.g-diff-row__label')?.textContent).toBe('Code block');
    expect(unchanged.querySelector('.g-diff-row__label svg')).toBeNull();
    // The same on both sides: drawn once, across the columns.
    const moved = screen.getByRole('group', { name: 'moved: Video block' });
    expect(moved.querySelectorAll('.g-diff-row__cell')).toHaveLength(0);
    expect(moved.querySelector('.g-diff-row__merged')?.textContent).toBe('V');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('inline: the merged difference, or before above after with visible labels', async () => {
    const { container } = render(
      <DiffView layout="inline" label="Inline">
        <DiffRow
          statuses={['changed']}
          what="Text block"
          before={<p>Old</p>}
          after={<p>New</p>}
          merged={<p>Both</p>}
        />
        <DiffRow statuses={['changed']} what="Image block" before={<p>Old</p>} after={<p>New</p>} />
        <DiffRow statuses={['added']} what="Check block" before={null} after={<p>Added</p>} />
        <DiffRow statuses={['removed']} what="Code block" before={<p>Gone</p>} after={null} />
        <DiffRow statuses={['renamed']} what="Chapter" before={<p>A</p>} after={<p>B</p>} />
        <DiffRow what="Video block" before={<p>Was</p>} after={<p>Same</p>} same />
      </DiffView>,
    );
    expect(container.querySelector('.g-diff__head')).toBeNull();
    const text = screen.getByRole('group', { name: 'changed: Text block' });
    expect(text.querySelector('.g-diff-row__merged')?.textContent).toBe('Both');
    const image = screen.getByRole('group', { name: 'changed: Image block' });
    expect([...image.querySelectorAll('.g-diff-row__cell')].map((c) => c.textContent)).toEqual([
      'BeforeOld',
      'AfterNew',
    ]);
    const added = screen.getByRole('group', { name: 'added: Check block' });
    expect([...added.querySelectorAll('.g-diff-row__cell')].map((c) => c.textContent)).toEqual([
      'AfterAdded',
    ]);
    const removed = screen.getByRole('group', { name: 'removed: Code block' });
    expect([...removed.querySelectorAll('.g-diff-row__cell')].map((c) => c.textContent)).toEqual([
      'BeforeGone',
    ]);
    expect(screen.getByRole('group', { name: 'renamed: Chapter' }).className).toBe(
      'g-diff-row g-diff-row--renamed',
    );
    // Unchanged, inline: drawn once, as it is now.
    const same = screen.getByRole('group', { name: 'Video block' });
    expect(same.querySelector('.g-diff-row__merged')?.textContent).toBe('Same');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('a row outside a view is inline', () => {
    render(<DiffRow statuses={['changed']} what="Text" before={<p>A</p>} after={<p>B</p>} />);
    expect(screen.getByText('Before').className).toBe('g-diff-row__side');
  });
});

describe('DiffUnchanged', () => {
  it('folds a run away until it is opened, and folds it again', async () => {
    const { container } = render(
      <DiffUnchanged label="3 unchanged blocks">
        <p>Hidden block</p>
      </DiffUnchanged>,
    );
    const toggle = screen.getByRole('button', { name: '3 unchanged blocks' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const body = document.getElementById(toggle.getAttribute('aria-controls') as string);
    expect(body?.hidden).toBe(true);
    expect(screen.queryByText('Hidden block')).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(body?.hidden).toBe(false);
    expect(screen.getByText('Hidden block')).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByText('Hidden block')).toBeNull();
  });

  it('can start open', () => {
    render(
      <DiffUnchanged label="1 unchanged question" defaultOpen>
        <p>Shown</p>
      </DiffUnchanged>,
    );
    expect(screen.getByText('Shown')).toBeTruthy();
  });
});

describe('DiffNote', () => {
  it('is a warning line with its sign', async () => {
    const { container } = render(<DiffNote className="x">Correct answer changed: B → C</DiffNote>);
    const note = container.querySelector('p') as HTMLElement;
    expect(note.className).toBe('g-diff-note x');
    expect(note.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(note.textContent).toBe('Correct answer changed: B → C');
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('DiffMedia', () => {
  it('shows an image as a thumbnail with its alt text and name', async () => {
    const { container } = render(
      <DiffMedia kind="image" url="https://example.com/a.png" name="Image block" alt="A diagram" />,
    );
    const img = screen.getByRole('img', { name: 'A diagram' });
    expect(img.getAttribute('src')).toBe('https://example.com/a.png');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(container.querySelector('figcaption')?.textContent).toBe('Image block');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('an image without alt text is decorative', () => {
    const { container } = render(
      <DiffMedia kind="image" url="https://example.com/a.png" name="Image block" />,
    );
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it.each([
    ['video', 'https://youtu.be/x', 'youtu.be'],
    ['embed', 'https://codepen.io/x', 'codepen.io'],
    ['file', '/files/a.pdf', '/files/a.pdf'],
    ['file', 'mailto:team@example.com', 'mailto:team@example.com'],
  ] as const)('shows a %s as a link card with its host', async (kind, url, host) => {
    const { container } = render(<DiffMedia kind={kind} url={url} name="Intro" className="x" />);
    const link = screen.getByRole('link', { name: `Intro · ${host} (opens in a new window)` });
    expect(link.getAttribute('href')).toBe(url);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer');
    expect(link.className).toBe('g-diff-media g-diff-media--link x');
    expect(link.querySelector('svg')).not.toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('says when there is no address', () => {
    const { container, rerender } = render(<DiffMedia kind="image" url="" name="Image block" />);
    expect(container.textContent).toBe('Image block · No address');
    expect(container.querySelector('img')).toBeNull();
    rerender(<DiffMedia kind="file" url="" name="File block" />);
    expect(container.textContent).toBe('File block · No address');
    expect(screen.queryByRole('link')).toBeNull();
  });
});
