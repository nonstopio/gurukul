import { formatBytes, PDF_CONTENT_TYPE } from '@gurukul/schema';
import { Input, Tabs } from '@gurukul/ui';
import { useState } from 'react';
import { BlockView } from '../../player/blocks';
import { PLACEHOLDER_FILE } from '../lessonEdit';
import { patch } from '../patch';
import { PdfUploadPanel } from './PdfUploadPanel';
import { PreviewWidth } from './PreviewWidth';
import type { BlockEditorProps } from './types';
import { usePdfUpload } from './usePdfUpload';

/**
 * A file learners can open: a link or an uploaded PDF. Link comes first and is the default for a new
 * block and a linked file, since a link costs no storage: the address field, for GitHub or Google
 * Drive files and anything bigger than the limit. The Upload tab (where an uploaded file opens)
 * checks the PDF in the browser and uploads it to Cloud Storage. The Label defaults to the file name and stays editable. The
 * preview is the learner's own File block ("Label · PDF · 420 KB").
 */
export function FileEditor({ block, onChange }: BlockEditorProps<'file'>) {
  const [tab, setTab] = useState(block.upload ? 'upload' : 'link');
  const source = usePdfUpload(block, onChange);
  const picked = 'picked' in source.stage ? source.stage.picked : undefined;
  // Before the upload the preview is the picked file itself, so the link already opens it.
  const shown = picked
    ? {
        ...block,
        url: picked.previewUrl,
        upload: {
          path: '',
          bytes: picked.file.size,
          contentType: PDF_CONTENT_TYPE,
          name: picked.file.name,
        },
      }
    : block;
  const real = picked !== undefined || (block.url !== '' && block.url !== PLACEHOLDER_FILE);

  return (
    <div className="studio-fields">
      <Tabs
        label="File source"
        value={tab}
        onValueChange={setTab}
        tabs={[
          {
            id: 'link',
            label: 'Link',
            panel: (
              <Input
                label="File address"
                type="url"
                hint={
                  block.upload
                    ? `This PDF is uploaded to Gurukul (${formatBytes(block.upload.bytes)}). An address here links another file instead.`
                    : 'A file on GitHub or Google Drive (shared with nonstopio.com), or any address.'
                }
                // A new block's stand-in address is not one to edit: the field starts empty.
                value={block.url === PLACEHOLDER_FILE ? '' : block.url}
                // The upload belongs to the old file: a typed address makes this a plain link.
                onChange={(e) => onChange(patch(block, { url: e.target.value, upload: undefined }))}
              />
            ),
          },
          {
            id: 'upload',
            label: 'Upload',
            panel: (
              <PdfUploadPanel
                block={block}
                source={source}
                onSwitchToLink={() => setTab('link')}
                onRemove={() => onChange(patch(block, { url: '', upload: undefined }))}
              />
            ),
          },
        ]}
      />
      <Input
        label="Label"
        hint="The words on the link. An uploaded PDF starts with its file name."
        value={block.label}
        onChange={(e) => onChange({ ...block, label: e.target.value })}
      />
      {real ? (
        <PreviewWidth>
          <BlockView block={{ ...shown, label: shown.label || 'Untitled file' }} />
        </PreviewWidth>
      ) : null}
    </div>
  );
}
