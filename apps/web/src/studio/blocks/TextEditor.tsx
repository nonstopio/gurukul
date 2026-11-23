import { CodeField } from './CodeField';
import { MarkdownField } from './MarkdownField';
import type { BlockEditorProps } from './types';

/** A text block: formatted text edited visually. Text the visual editor cannot keep opens as Markdown. */
export function TextEditor({ block, onChange }: BlockEditorProps<'markdown'>) {
  return (
    <MarkdownField label="Text" value={block.md} onChange={(md) => onChange({ ...block, md })}>
      <CodeField
        label="Text (Markdown)"
        language="markdown"
        tone="prose"
        rows={8}
        value={block.md}
        onChange={(md) => onChange({ ...block, md })}
      />
    </MarkdownField>
  );
}
