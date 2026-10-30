import { BlockFrame, SegmentedControl } from '@gurukul/ui';
import type { BlockFrameProps } from '@gurukul/ui';
import type { Block } from '@gurukul/schema';
import { useState } from 'react';
import { BlockView } from '../../player/blocks';
import { BlockEditor } from './BlockEditor';

const VIEWS = [
  { value: 'edit', label: 'Edit' },
  { value: 'preview', label: 'Preview' },
] as const;

/**
 * A block's frame with an Edit | Preview switch in its header: the editor swaps for what a learner sees,
 * drawn by the learner's own renderer. Text keeps its toolbar Preview, which also swaps in place.
 */
export function BlockPreviewFrame({
  block,
  onChange,
  ...frame
}: Omit<BlockFrameProps, 'children' | 'controls'> & {
  block: Block;
  onChange: (block: Block) => void;
}) {
  const [preview, setPreview] = useState(false);
  const own = block.type === 'markdown';
  return (
    <BlockFrame
      {...frame}
      controls={
        own ? undefined : (
          <SegmentedControl
            label={`View ${frame.label}`}
            value={preview ? 'preview' : 'edit'}
            options={VIEWS}
            onChange={(view) => setPreview(view === 'preview')}
          />
        )
      }
    >
      {preview && !own ? (
        <BlockView block={block} />
      ) : (
        <BlockEditor block={block} onChange={onChange} />
      )}
    </BlockFrame>
  );
}
