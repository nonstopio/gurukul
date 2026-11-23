import { Input, SegmentedControl, Textarea } from '@gurukul/ui';
import { patch } from '../patch';
import { MarkdownField } from './MarkdownField';
import type { BlockEditorProps } from './types';

const TONES = [
  { value: 'note', label: 'Note' },
  { value: 'tip', label: 'Tip' },
  { value: 'warning', label: 'Warning' },
] as const;

/** A highlighted note, tip or warning: tone, optional title and Markdown text. */
export function CalloutEditor({ block, onChange }: BlockEditorProps<'callout'>) {
  return (
    <div className="studio-fields">
      <SegmentedControl
        label="Tone"
        value={block.tone}
        options={TONES}
        onChange={(tone) => onChange({ ...block, tone })}
      />
      <Input
        label="Title (optional)"
        value={block.title ?? ''}
        onChange={(e) => onChange(patch(block, { title: e.target.value || undefined }))}
      />
      <MarkdownField label="Text" value={block.md} onChange={(md) => onChange({ ...block, md })}>
        <Textarea
          label="Text (Markdown)"
          rows={4}
          value={block.md}
          onChange={(e) => onChange({ ...block, md: e.target.value })}
        />
      </MarkdownField>
    </div>
  );
}
