import { ImageFigure, Input, SegmentedControl, ToggleCard } from '@gurukul/ui';
import type { ImageLayout } from '@gurukul/ui';
import { patch } from '../patch';
import type { BlockEditorProps } from './types';

const LAYOUTS = [
  { value: 'column', label: 'Column' },
  { value: 'medium', label: 'Medium' },
  { value: 'small', label: 'Small' },
] as const satisfies ReadonlyArray<{ value: ImageLayout; label: string }>;

/**
 * An image by address. Alt text is required: it is what people who cannot see the image hear.
 * Layout, Open full size and Border work for linked images too; a linked image's width and height
 * are read from the loaded preview so the lesson does not jump while it loads.
 */
export function ImageEditor({ block, onChange }: BlockEditorProps<'image'>) {
  return (
    <div className="studio-fields">
      <Input
        label="Image address"
        type="url"
        value={block.url}
        onChange={(e) =>
          // The size belongs to the old address; the preview reads the new one once it loads.
          onChange(
            block.upload
              ? { ...block, url: e.target.value }
              : patch(block, { url: e.target.value, width: undefined, height: undefined }),
          )
        }
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
      <div className="studio-group">
        <span className="studio-group__label">Layout</span>
        <SegmentedControl
          label="Layout"
          value={block.layout ?? 'column'}
          options={LAYOUTS}
          onChange={(layout) => onChange({ ...block, layout })}
        />
      </div>
      <ToggleCard
        title="Open full size"
        description="Clicking the image opens it at its natural size."
        checked={block.zoom ?? false}
        onChange={(e) => onChange({ ...block, zoom: e.target.checked })}
      />
      <ToggleCard
        title="Border"
        description="A thin frame round the image. Turn it off for photos and transparent images."
        checked={block.border ?? true}
        onChange={(e) => onChange({ ...block, border: e.target.checked })}
      />
      {block.url ? (
        <ImageFigure
          src={block.url}
          alt={block.alt || 'Image preview'}
          layout={block.layout}
          border={block.border}
          width={block.width}
          height={block.height}
          onSize={
            block.upload
              ? undefined
              : ({ width, height }) => {
                  if (width !== block.width || height !== block.height) {
                    onChange({ ...block, width, height });
                  }
                }
          }
        />
      ) : null}
    </div>
  );
}
