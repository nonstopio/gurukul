import { EditorView } from '@codemirror/view';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type * as CodeFieldModule from '../src/studio/blocks/CodeField';
import type { CodeFieldHandle } from '../src/studio/blocks/codeFieldTypes';

const { CodeField } = await vi.importActual<typeof CodeFieldModule>(
  '../src/studio/blocks/CodeField',
);

function Harness({
  language = 'markdown',
  handle,
  seen,
}: {
  language?: string;
  handle?: { current: CodeFieldHandle | null };
  seen?: string[];
}) {
  const [value, setValue] = useState('hello');
  return (
    <>
      <CodeField
        label="Body"
        language={language}
        tone={language === 'markdown' ? 'prose' : 'code'}
        rows={4}
        value={value}
        {...(handle ? { handleRef: handle } : {})}
        onChange={(v) => {
          seen?.push(v);
          setValue(v);
        }}
      />
      <button onClick={() => setValue('replaced')}>Replace</button>
    </>
  );
}

const viewOf = () =>
  EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement) as EditorView;

describe('CodeField', () => {
  it('shows a labelled textarea while CodeMirror loads, then CodeMirror', async () => {
    const handle = { current: null as CodeFieldHandle | null };
    render(<Harness handle={handle} />);
    const area = screen.getByLabelText('Body') as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.getAttribute('spellcheck')).toBe('true');
    // Code is mono and unchecked in the fallback too.
    render(<Harness language="json" />);
    const code = screen.getAllByLabelText('Body')[1] as HTMLTextAreaElement;
    expect(code.getAttribute('spellcheck')).toBe('false');
    expect(code.closest('.studio-mono')).not.toBeNull();
    expect(handle.current?.getSelection()).toEqual({ start: 0, end: 0 });
    handle.current?.select(1, 3);
    expect(handle.current?.getSelection()).toEqual({ start: 1, end: 3 });
    fireEvent.change(area, { target: { value: 'typed early' } });
    expect(area.value).toBe('typed early');
    await waitFor(() => expect(document.querySelector('.cm-editor')).not.toBeNull());
    expect(viewOf().state.doc.toString()).toBe('typed early');
    await waitFor(() => expect(document.querySelectorAll('.cm-editor').length).toBe(2));
  });

  it('reports edits, and takes a new value and selection from outside', async () => {
    const seen: string[] = [];
    const handle = { current: null as CodeFieldHandle | null };
    render(<Harness seen={seen} handle={handle} />);
    await waitFor(() => expect(document.querySelector('.cm-editor')).not.toBeNull());
    act(() => viewOf().dispatch({ changes: { from: 5, insert: '!' } }));
    expect(seen).toEqual(['hello!']);

    act(() => screen.getByRole('button', { name: 'Replace' }).click());
    expect(viewOf().state.doc.toString()).toBe('replaced');
    expect(seen).toEqual(['hello!']);

    act(() => handle.current?.select(2, 4));
    expect(handle.current?.getSelection()).toEqual({ start: 2, end: 4 });
  });

  it.each([
    'typescript',
    'json',
    'python',
    'sql',
    'yaml',
    'java',
    'html',
    'css',
    'tsx',
    'javascript',
    'bash',
  ])('opens %s', async (language) => {
    render(<Harness language={language} />);
    await waitFor(() => expect(document.querySelector('.cm-editor')).not.toBeNull());
    expect(viewOf().state.doc.toString()).toBe('hello');
  });
});
