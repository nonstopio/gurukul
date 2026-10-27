import { Input } from '@gurukul/ui';
import type { BlockEditorProps } from './types';

/** A link to a file learners can open: its address and the words on the link. */
export function FileEditor({ block, onChange }: BlockEditorProps<'file'>) {
  return (
    <div className="studio-fields">
      <Input
        label="File address"
        type="url"
        value={block.url}
        onChange={(e) => onChange({ ...block, url: e.target.value })}
      />
      <Input
        label="Link text"
        value={block.label}
        onChange={(e) => onChange({ ...block, label: e.target.value })}
      />
    </div>
  );
}
