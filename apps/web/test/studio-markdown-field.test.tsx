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
  it('starts Visual, and keeps typing while the editor loads', async () => {
    render(<Harness start="Hello" />);
    const early = screen.getByLabelText('Text') as HTMLTextAreaElement;
    fireEvent.change(early, { target: { value: 'Hello there' } });
    await editor();
    expect(screen.getByRole('button', { name: 'Visual' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.queryByText(LOSSY_WARNING)).toBeNull();
    expect(document.querySelector('.ProseMirror')?.textContent).toBe('Hello there');
  });

  it('switches to the Markdown and back', async () => {
    render(<Harness start="Hello" />);
    await editor();
    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    expect(document.querySelector('.ProseMirror')).toBeNull();
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: '**Hi**' } });
    fireEvent.click(screen.getByRole('button', { name: 'Visual' }));
    await editor();
    expect(document.querySelector('.ProseMirror strong')?.textContent).toBe('Hi');
  });

  it('opens text the visual editor cannot keep in Markdown, with a warning, and leaves it alone', async () => {
    render(<Harness start={'<div>x</div>'} />);
    await screen.findByText(LOSSY_WARNING);
    expect(screen.getByRole('button', { name: 'Markdown' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect((screen.getByLabelText('Source') as HTMLTextAreaElement).value).toBe('<div>x</div>');
    // Asking again says the same, until the text can be kept.
    fireEvent.click(screen.getByRole('button', { name: 'Visual' }));
    await screen.findByText(LOSSY_WARNING);
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'plain' } });
    fireEvent.click(screen.getByRole('button', { name: 'Visual' }));
    await editor();
    expect(screen.queryByText(LOSSY_WARNING)).toBeNull();
  });
});
