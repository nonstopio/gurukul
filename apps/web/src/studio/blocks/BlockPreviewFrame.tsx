import { BlockFrame, Button } from '@gurukul/ui';
import type { BlockFrameProps } from '@gurukul/ui';
import type { Block } from '@gurukul/schema';
import { useState } from 'react';
import { BlockView } from '../../player/blocks';
import { BlockEditor } from './BlockEditor';

/**
 * A block's frame with a Preview toggle in its header: the editor swaps for what a learner sees,
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
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={preview}
            onClick={() => setPreview(!preview)}
          >
            Preview
          </Button>
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
