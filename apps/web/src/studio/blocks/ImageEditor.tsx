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
 * hear. Link comes first and is the default for a new block and a linked image, since a link costs
 * no storage; the Upload tab (where an uploaded image opens) checks the file in the browser,
 * previews it, and uploads it to Cloud Storage. Layout, Open full size and Border work for both; a linked
 * image's width and height are read from the loaded preview so the lesson does not jump.
 */
export function ImageEditor({ block, onChange }: BlockEditorProps<'image'>) {
  const [tab, setTab] = useState(block.upload ? 'upload' : 'link');
  const source = useImageUpload(block, onChange);
  const picked = 'picked' in source.stage ? source.stage.picked : undefined;
  // A new block's stand-in address is not an image: nothing to preview until there is a real one.
  const src = picked?.previewUrl ?? (block.url === PLACEHOLDER_IMAGE ? '' : block.url);
  const size = picked ?? block;
  const border = block.border ?? true;

  return (
    <div className="studio-fields">
      <Tabs
        label="Image source"
        value={tab}
        onValueChange={setTab}
        tabs={[
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
                // A new block's stand-in address is not one to edit: the field starts empty.
                value={block.url === PLACEHOLDER_IMAGE ? '' : block.url}
                onChange={(e) => {
                  // A typed address is the image now: an upload still running, or a file waiting
                  // for Upload, must not replace it (`drop` makes sure the upload writes nothing).
                  source.drop();
                  // The size and the upload belong to the old image; the preview reads the new
                  // address once it loads.
                  onChange(
                    patch(block, {
                      url: e.target.value,
                      upload: undefined,
                      width: undefined,
                      height: undefined,
                    }),
                  );
                }}
              />
            ),
          },
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
        title={block.zoom ? 'Open full size' : 'No full-size view'}
        description={
          block.zoom
            ? 'Clicking the image opens it at its natural size.'
            : 'The image stays in the page; clicking it does nothing.'
        }
        checked={block.zoom ?? false}
        onChange={(e) => onChange({ ...block, zoom: e.target.checked })}
      />
      <ToggleCard
        title={border ? 'Border' : 'No border'}
        description={
          border
            ? 'A thin frame round the image. Turn it off for photos and transparent images.'
            : 'The image sits on the page with no frame, as photos and transparent images suit.'
        }
        checked={border}
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
            blurHash={picked ? undefined : block.upload?.blurHash}
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
