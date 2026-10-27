import { isEmbedAllowed } from '@gurukul/schema';
import { Chip, Input } from '@gurukul/ui';
import type { BlockEditorProps } from './types';

/** An iframe from the allow-list (YouTube, Loom, Google Drive, CodeSandbox, StackBlitz) with a title for screen readers. */
export function EmbedEditor({ block, onChange }: BlockEditorProps<'embed'>) {
  const allowed = isEmbedAllowed(block.url);
  return (
    <div className="studio-fields">
      <Input
        label="Embed address"
        type="url"
        value={block.url}
        onChange={(e) => onChange({ ...block, url: e.target.value })}
      />
      <p className="studio-detect" role="status">
        {allowed ? (
          <Chip tone="accent">Allowed host</Chip>
        ) : (
          <Chip tone="warning">Host not on the allowed list</Chip>
        )}
        {allowed ? null : (
          <span className="studio-muted">
            Only YouTube, Loom, Google Drive, CodeSandbox and StackBlitz can be embedded.
          </span>
        )}
      </p>
      <Input
        label="Title"
        hint="Read out by screen readers."
        value={block.title}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
      />
    </div>
  );
}
