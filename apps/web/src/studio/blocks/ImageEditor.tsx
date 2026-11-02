import { ImageFigure, Input, SegmentedControl, Tabs, ToggleCard } from '@gurukul/ui';
import type { ImageLayout } from '@gurukul/ui';
import { useState } from 'react';
import { PLACEHOLDER_IMAGE } from '../lessonEdit';
import { patch } from '../patch';
import { CourseImagePicker } from './CourseImagePicker';
import { ImageUploadPanel } from './ImageUploadPanel';
import { PreviewWidth } from './PreviewWidth';
import type { BlockEditorProps } from './types';
import { useImageUpload } from './useImageUpload';

const LAYOUTS = [
  { value: 'column', label: 'Column' },
  { value: 'medium', label: 'Medium' },
  { value: 'small', label: 'Small' },
] as const satisfies ReadonlyArray<{ value: ImageLayout; label: string }>;

/**
 * An image, uploaded or linked. Alt text is required: it is what people who cannot see the image
 * hear. The Upload tab (the default for a new block and for an uploaded image) checks the file in
 * the browser, previews it, and uploads it to Cloud Storage; the Link tab is the address field. An
 * existing linked image opens on Link. Layout, Open full size and Border work for both; a linked
 * image's width and height are read from the loaded preview so the lesson does not jump.
 */
export function ImageEditor({ block, onChange }: BlockEditorProps<'image'>) {
  const [tab, setTab] = useState(
    block.url && block.url !== PLACEHOLDER_IMAGE && !block.upload ? 'link' : 'upload',
  );
  const source = useImageUpload(block, onChange);
  const picked = 'picked' in source.stage ? source.stage.picked : undefined;
  // A new block's stand-in address is not an image: nothing to preview until there is a real one.
  const src = picked?.previewUrl ?? (block.url === PLACEHOLDER_IMAGE ? '' : block.url);
  const size = picked ?? block;

  return (
    <div className="studio-fields">
      <Tabs
        label="Image source"
        value={tab}
        onValueChange={setTab}
        tabs={[
          {
            id: 'upload',
            label: 'Upload',
            panel: (
              <ImageUploadPanel
                block={block}
                source={source}
                onRemove={() =>
                  onChange(
                    patch(block, {
                      url: '',
                      upload: undefined,
                      width: undefined,
                      height: undefined,
                    }),
                  )
                }
              />
            ),
          },
          {
            id: 'link',
            label: 'Link',
            panel: (
              <Input
                label="Image address"
                type="url"
                hint={
                  block.upload
                    ? 'This image is uploaded to Gurukul. An address here links another image instead.'
                    : undefined
                }
                value={block.url}
                onChange={(e) =>
                  // The size and the upload belong to the old image; the preview reads the new
                  // address once it loads.
                  onChange(
                    patch(block, {
                      url: e.target.value,
                      upload: undefined,
                      width: undefined,
                      height: undefined,
                    }),
                  )
                }
              />
            ),
          },
        ]}
      />
      {picked ? null : (
        <CourseImagePicker
          current={block.upload?.path}
          onChoose={({ url, upload, width, height }) => {
            setTab('upload');
            onChange(patch(block, { url, upload, width, height }));
          }}
        />
      )}
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
      {src ? (
        <PreviewWidth>
          <ImageFigure
            src={src}
            alt={block.alt || 'Image preview'}
            layout={block.layout}
            border={block.border}
            width={size.width}
            height={size.height}
            caption={block.caption}
            onSize={
              block.upload || picked
                ? undefined
                : ({ width, height }) => {
                    if (width !== block.width || height !== block.height) {
                      onChange({ ...block, width, height });
                    }
                  }
            }
          />
        </PreviewWidth>
      ) : null}
    </div>
  );
}
