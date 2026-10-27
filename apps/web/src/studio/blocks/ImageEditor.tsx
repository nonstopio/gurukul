import { Input } from '@gurukul/ui';
import { patch } from '../patch';
import type { BlockEditorProps } from './types';

/** An image by address. Alt text is required: it is what people who cannot see the image hear. */
export function ImageEditor({ block, onChange }: BlockEditorProps<'image'>) {
  return (
    <div className="studio-fields">
      <Input
        label="Image address"
        type="url"
        value={block.url}
        onChange={(e) => onChange({ ...block, url: e.target.value })}
      />
      <Input
        label="Alt text (required)"
        hint="Describe what the image shows, for people who cannot see it. Say what it means, not 'image of'."
        required
        value={block.alt}
        onChange={(e) => onChange({ ...block, alt: e.target.value })}
      />
      <Input
        label="Caption (optional)"
        value={block.caption ?? ''}
        onChange={(e) => onChange(patch(block, { caption: e.target.value || undefined }))}
      />
    </div>
  );
}
