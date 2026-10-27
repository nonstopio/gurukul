import { Button, Textarea } from '@gurukul/ui';
import { useLayoutEffect, useRef, useState } from 'react';
import { Prose } from '../../player/blocks';
import { bold, inlineCode, italic, link, numberedList } from './markdownTools';
import type { TextEdit } from './markdownTools';
import type { BlockEditorProps } from './types';

const TOOLS: Array<{
  label: string;
  apply: (text: string, start: number, end: number) => TextEdit;
}> = [
  { label: 'Bold', apply: bold },
  { label: 'Italic', apply: italic },
  { label: 'Inline code', apply: inlineCode },
  { label: 'Link', apply: link },
  { label: 'Numbered list', apply: numberedList },
];

function Preview({ md }: { md: string }) {
  return md.trim() === '' ? (
    <p className="studio-muted">Nothing to preview yet.</p>
  ) : (
    <Prose md={md} />
  );
}

/** Markdown in a plain textarea, with a toolbar that wraps the selection and a preview that uses the learner renderer. */
export function TextEditor({ block, onChange }: BlockEditorProps<'markdown'>) {
  const [preview, setPreview] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const selection = useRef<{ start: number; end: number } | null>(null);

  const textarea = () =>
    (wrap.current as HTMLDivElement).querySelector('textarea') as HTMLTextAreaElement;

  // After a toolbar edit re-renders the textarea, put the selection where the edit says.
  useLayoutEffect(() => {
    const pending = selection.current;
    if (!pending) return;
    selection.current = null;
    const el = textarea();
    el.focus();
    el.setSelectionRange(pending.start, pending.end);
  });

  const run = (apply: (text: string, start: number, end: number) => TextEdit) => {
    const el = textarea();
    const edit = apply(block.md, el.selectionStart, el.selectionEnd);
    selection.current = { start: edit.start, end: edit.end };
    onChange({ ...block, md: edit.text });
  };

  return (
    <div className="studio-text" ref={wrap}>
      <div className="studio-toolbar" role="toolbar" aria-label="Text formatting">
        {TOOLS.map((tool) => (
          <Button
            key={tool.label}
            variant="ghost"
            disabled={preview}
            onClick={() => run(tool.apply)}
          >
            {tool.label}
          </Button>
        ))}
        <Button variant="secondary" aria-pressed={preview} onClick={() => setPreview(!preview)}>
          Preview
        </Button>
      </div>
      {preview ? (
        <Preview md={block.md} />
      ) : (
        <Textarea
          label="Text (Markdown)"
          value={block.md}
          rows={8}
          onChange={(e) => onChange({ ...block, md: e.target.value })}
        />
      )}
    </div>
  );
}
