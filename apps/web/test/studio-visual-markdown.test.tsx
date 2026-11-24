import { Editor, editorViewCtx } from '@milkdown/kit/core';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { MarkType } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type * as ViewModule from '../src/studio/blocks/VisualMarkdownView';

const { default: View, LINK_PROBLEM } = await vi.importActual<typeof ViewModule>(
  '../src/studio/blocks/VisualMarkdownView',
);

function Harness({
  start,
  seen,
  lossy,
  error,
}: {
  start: string;
  seen?: string[];
  lossy?: () => void;
  error?: string;
}) {
  const [value, setValue] = useState(start);
  return (
    <>
      <View
        label="Body"
        hint="A hint"
        error={error}
        value={value}
        onChange={(md) => {
          seen?.push(md);
          setValue(md);
        }}
        onLossy={lossy ?? (() => {})}
      />
      <button onClick={() => setValue('# Replaced')}>Replace</button>
      <output data-testid="value">{value}</output>
    </>
  );
}

const box = () => document.querySelector('.ProseMirror') as HTMLElement;
// Shown once the text has been read in and written back and found to keep its meaning.
const shown = () =>
  waitFor(() => {
    expect(box()).not.toBeNull();
    expect(document.querySelector('.studio-text')?.hasAttribute('hidden')).toBe(false);
  });

// jsdom has no layout: ProseMirror scrolls the caret into view by measuring a Range.
Range.prototype.getClientRects = () =>
  ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

// The editor made last: jsdom cannot type into ProseMirror, so the tests dispatch to its view.
let made: Editor;
const make = Editor.make;
vi.spyOn(Editor, 'make').mockImplementation(() => (made = make()));
const view = () => made.action((ctx) => ctx.get(editorViewCtx)) as EditorView;
const select = (from: number, to: number) =>
  view().dispatch(view().state.tr.setSelection(TextSelection.create(view().state.doc, from, to)));
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const value = () => screen.getByTestId('value').textContent;

describe('the visual editor', () => {
  it('shows the text formatted and writes nothing back for opening it', async () => {
    const seen: string[] = [];
    render(<Harness start={'Hello **world**'} seen={seen} />);
    await shown();
    expect(box().querySelector('strong')?.textContent).toBe('world');
    expect(box().getAttribute('aria-label')).toBe('Body');
    expect(box().getAttribute('aria-describedby')).toBeTruthy();
    expect(box().hasAttribute('aria-invalid')).toBe(false);
    expect(screen.getByRole('toolbar', { name: 'Body formatting' })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toEqual([]);
  });

  it('wires an error to the editor, and takes it away again', async () => {
    const { rerender } = render(<Harness start="x" error="Required" />);
    await shown();
    expect(box().getAttribute('aria-invalid')).toBe('true');
    rerender(<Harness start="x" />);
    expect(box().hasAttribute('aria-invalid')).toBe(false);
  });

  it.each([
    ['Bold', '**Hello**'],
    ['Italic', '*Hello*'],
    ['Strikethrough', '~~Hello~~'],
    ['Heading 2', '## Hello'],
    ['Heading 3', '### Hello'],
    ['Bulleted list', '* Hello'],
    ['Numbered list', '1. Hello'],
    ['Quote', '> Hello'],
    ['Code block', '```\nHello\n```'],
  ])('the %s button formats the selection', async (name, expected) => {
    render(<Harness start="Hello" />);
    await shown();
    select(1, 6);
    press(name);
    expect(value()).toBe(expected);
    expect(document.activeElement).toBe(box());
  });

  it('turns a heading back into a paragraph, and undoes and redoes', async () => {
    render(<Harness start="# Hello" />);
    await shown();
    select(1, 3);
    press('Paragraph');
    expect(value()).toBe('Hello');
    press('Undo');
    expect(value()).toBe('# Hello');
    press('Redo');
    expect(value()).toBe('Hello');
  });

  it('makes a link from the selection, for an http, https or mailto address only', async () => {
    render(<Harness start="Hello" />);
    await shown();
    select(1, 6);
    press('Link');
    const address = screen.getByLabelText('Link address');
    fireEvent.change(address, { target: { value: 'javascript:alert(1)' } });
    press('Add link');
    expect(screen.getByText(LINK_PROBLEM)).toBeTruthy();
    expect(value()).toBe('Hello');
    fireEvent.change(address, { target: { value: 'https://example.com/a' } });
    press('Add link');
    expect(value()).toBe('[Hello](https://example.com/a)');
    expect(screen.queryByLabelText('Link address')).toBeNull();
  });

  it('writes the address as its own words when nothing is selected, and Cancel closes the form', async () => {
    render(<Harness start="" />);
    await shown();
    press('Link');
    press('Cancel');
    expect(screen.queryByLabelText('Link address')).toBeNull();
    press('Link');
    fireEvent.change(screen.getByLabelText('Link address'), {
      target: { value: 'mailto:a@example.com' },
    });
    press('Add link');
    expect(value()).toBe('<mailto:a@example.com>');
  });

  it('removes a link to an unsafe address that arrives by paste', async () => {
    render(<Harness start="Hello" />);
    await shown();
    const { state } = view();
    const mark = (state.schema.marks.link as MarkType).create({ href: 'javascript:alert(1)' });
    view().dispatch(state.tr.addMark(1, 6, mark));
    expect(value()).toBe('Hello');
    expect(view().state.doc.rangeHasMark(1, 6, state.schema.marks.link as MarkType)).toBe(false);
  });

  it('keeps unsafe markup out of text read in', async () => {
    const lossy = vi.fn();
    render(<Harness start={'a <b>b</b> [c](javascript:x)'} lossy={lossy} />);
    await waitFor(() => expect(lossy).toHaveBeenCalledOnce());
    expect(box().innerHTML).not.toContain('<b>');
    expect(box().querySelector('a')).toBeNull();
  });

  it('says so, and shows nothing, when the text would change', async () => {
    const lossy = vi.fn();
    const { container } = render(<Harness start={'<div>x</div>'} lossy={lossy} />);
    await waitFor(() => expect(lossy).toHaveBeenCalledOnce());
    expect(container.querySelector('.studio-text')?.hasAttribute('hidden')).toBe(true);
  });

  it('takes a new value from outside without writing it back, and checks that too', async () => {
    const seen: string[] = [];
    const lossy = vi.fn();
    render(<Harness start="Hello" seen={seen} lossy={lossy} />);
    await shown();
    fireEvent.click(screen.getByText('Replace'));
    expect(box().querySelector('h1')?.textContent).toBe('Replaced');
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toEqual([]);
    expect(lossy).not.toHaveBeenCalled();
  });

  it('reports a new value from outside that the editor could not keep', async () => {
    const lossy = vi.fn();
    function Swap() {
      const [md, setMd] = useState('Hello');
      return (
        <>
          <View label="Body" value={md} onChange={setMd} onLossy={lossy} />
          <button onClick={() => setMd('<i>x</i>')}>Swap</button>
        </>
      );
    }
    render(<Swap />);
    await shown();
    fireEvent.click(screen.getByText('Swap'));
    expect(lossy).toHaveBeenCalledOnce();
  });

  it('does not undo typing when React shows it a text it was sent a moment ago', async () => {
    const onChange = vi.fn();
    const props = { label: 'Body', onChange, onLossy: () => {} };
    const { rerender } = render(<View {...props} value="Hello" />);
    await shown();
    select(1, 6);
    press('Bold');
    press('Heading 2');
    expect(onChange).toHaveBeenLastCalledWith('## **Hello**');
    // The page renders the first of the two texts after the second was written, then catches up.
    rerender(<View {...props} value="**Hello**" />);
    expect(box().querySelector('h2')).not.toBeNull();
    rerender(<View {...props} value="## **Hello**" />);
    expect(box().querySelector('h2 strong')?.textContent).toBe('Hello');
  });

  it('can be closed before it has loaded', () => {
    const { unmount } = render(<Harness start="Hello" />);
    expect(() => unmount()).not.toThrow();
  });
});
