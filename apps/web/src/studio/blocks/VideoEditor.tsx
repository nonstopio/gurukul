import { videoEmbedUrl } from '@gurukul/schema';
import { Chip, Input, Select, Toggle } from '@gurukul/ui';
import { patch } from '../patch';
import type { BlockEditorProps } from './types';

const PROVIDERS = { youtube: 'YouTube', drive: 'Google Drive', loom: 'Loom' } as const;

/** Provider, address, captions, optional title and caption, and optional length of a video, with a chip that says whether the link can be embedded. */
export function VideoEditor({ block, onChange }: BlockEditorProps<'video'>) {
  const embed = videoEmbedUrl(block.provider, block.url);
  const recognised = embed !== null;
  return (
    <div className="studio-fields">
      <Select
        label="Video host"
        value={block.provider}
        onChange={(e) => onChange({ ...block, provider: e.target.value as keyof typeof PROVIDERS })}
      >
        {Object.entries(PROVIDERS).map(([value, name]) => (
          <option key={value} value={value}>
            {name}
          </option>
        ))}
      </Select>
      <Input
        label="Video link"
        type="url"
        value={block.url}
        onChange={(e) => onChange({ ...block, url: e.target.value })}
      />
      <p className="studio-detect" role="status">
        {recognised ? (
          <Chip tone="accent">{PROVIDERS[block.provider]}</Chip>
        ) : (
          <Chip tone="warning">Link not recognised as {PROVIDERS[block.provider]}</Chip>
        )}
        {recognised ? null : (
          <span className="studio-muted">
            Learners will see a plain link to open it in a new tab.
          </span>
        )}
      </p>
      {embed ? (
        <div className="studio-video-preview">
          <iframe src={embed} title="Video preview" loading="lazy" allowFullScreen />
        </div>
      ) : null}
      <Toggle
        label="Captions are available"
        checked={block.captions}
        onChange={(e) => onChange({ ...block, captions: e.target.checked })}
      />
      <Input
        label="Title (optional)"
        value={block.title ?? ''}
        maxLength={200}
        onChange={(e) => onChange(patch(block, { title: e.target.value || undefined }))}
      />
      <Input
        label="Caption (optional)"
        value={block.caption ?? ''}
        maxLength={300}
        onChange={(e) => onChange(patch(block, { caption: e.target.value || undefined }))}
      />
      <Input
        label="Length in seconds (optional)"
        type="number"
        min={1}
        value={block.durationSec ?? ''}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          onChange(patch(block, { durationSec: n > 0 ? n : undefined }));
        }}
      />
    </div>
  );
}
