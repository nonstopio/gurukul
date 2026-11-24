import type { Block } from '@gurukul/schema';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BlockEditor } from '../src/studio/blocks/BlockEditor';
import { LOSSY_WARNING } from '../src/studio/blocks/MarkdownField';
import { newBlock } from '../src/studio/lessonEdit';
import { BlockProviders } from './block-harness';
import { fakeData, makeCourse } from './fake-data';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';

// The real visual editor, so text it cannot keep reaches each caller's plain Markdown fallback.
vi.mock('../src/studio/blocks/VisualMarkdownView', async (original) => await original());

const RAW_HTML = '<div>x</div>';

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

describe.each([
  ['text', 'markdown'],
  ['callout', 'callout'],
] as const)('the %s block with text the visual editor cannot keep', (_name, type) => {
  it('shows it as Markdown with a warning, and edits it there', async () => {
    const seen = vi.fn();
    render(
      <BlockProviders>
        <Harness initial={{ ...newBlock(type), md: RAW_HTML } as Block} seen={seen} />
      </BlockProviders>,
    );
    await screen.findByText(LOSSY_WARNING);
    fireEvent.change(screen.getByLabelText('Text (Markdown)'), { target: { value: 'plain' } });
    expect(seen.mock.lastCall?.[0]).toMatchObject({ md: 'plain' });
  });
});

describe('the course description with text the visual editor cannot keep', () => {
  it('shows it as Markdown with a warning, and edits it there', async () => {
    const live = makeCourse({ educatorIds: ['u1'], version: 3 });
    await openApp(`/studio/courses/${live.id}`, {
      roles: ['educator'],
      studio: fakeStudio({
        draft: draftDoc({ ...live, description: RAW_HTML }, { rev: 5, answers: {} }),
      }),
      data: fakeData({ courses: [live] }),
    });
    fireEvent.click(await screen.findByRole('tab', { name: 'Landing page' }));
    await screen.findByText(LOSSY_WARNING);
    const source = screen.getByLabelText('Description (Markdown)') as HTMLTextAreaElement;
    fireEvent.change(source, { target: { value: '**Source** words' } });
    expect(source.value).toBe('**Source** words');
  });
});
