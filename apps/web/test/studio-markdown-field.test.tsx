import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LOSSY_WARNING, MarkdownField } from '../src/studio/blocks/MarkdownField';

// The real visual editor, not the textarea the other tests use.
vi.mock('../src/studio/blocks/VisualMarkdownView', async (original) => await original());

function Harness({ start }: { start: string }) {
  const [md, setMd] = useState(start);
  return (
    <MarkdownField label="Text" hint="A hint" value={md} onChange={setMd}>
      <textarea aria-label="Source" value={md} onChange={(e) => setMd(e.target.value)} />
    </MarkdownField>
  );
}

const editor = () => waitFor(() => expect(document.querySelector('.ProseMirror')).not.toBeNull());

describe('MarkdownField', () => {
  it('is the visual editor only, and keeps typing while it loads', async () => {
    render(<Harness start="Hello" />);
    const early = screen.getByLabelText('Text') as HTMLTextAreaElement;
    fireEvent.change(early, { target: { value: 'Hello there' } });
    await editor();
    expect(screen.queryByRole('button', { name: 'Markdown' })).toBeNull();
    expect(screen.queryByText(LOSSY_WARNING)).toBeNull();
    expect(screen.queryByLabelText('Source')).toBeNull();
    expect(document.querySelector('.ProseMirror')?.textContent).toBe('Hello there');
  });

  it('shows text the visual editor cannot keep as Markdown, with a warning, and leaves it alone', async () => {
    render(<Harness start={'<div>x</div>'} />);
    await screen.findByText(LOSSY_WARNING);
    expect(document.querySelector('.ProseMirror')).toBeNull();
    expect((screen.getByLabelText('Source') as HTMLTextAreaElement).value).toBe('<div>x</div>');
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'plain' } });
    expect((screen.getByLabelText('Source') as HTMLTextAreaElement).value).toBe('plain');
  });
});
