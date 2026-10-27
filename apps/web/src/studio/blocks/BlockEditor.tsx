import type { Block } from '@gurukul/schema';
import { CalloutEditor } from './CalloutEditor';
import { CheckEditor } from './CheckEditor';
import { CodeEditor } from './CodeEditor';
import { EmbedEditor } from './EmbedEditor';
import { FileEditor } from './FileEditor';
import { ImageEditor } from './ImageEditor';
import { TextEditor } from './TextEditor';
import { VideoEditor } from './VideoEditor';

/** The editor for one block, chosen by its type. */
export function BlockEditor({
  block,
  onChange,
}: {
  block: Block;
  onChange: (block: Block) => void;
}) {
  switch (block.type) {
    case 'markdown':
      return <TextEditor block={block} onChange={onChange} />;
    case 'video':
      return <VideoEditor block={block} onChange={onChange} />;
    case 'code':
      return <CodeEditor block={block} onChange={onChange} />;
    case 'callout':
      return <CalloutEditor block={block} onChange={onChange} />;
    case 'image':
      return <ImageEditor block={block} onChange={onChange} />;
    case 'embed':
      return <EmbedEditor block={block} onChange={onChange} />;
    case 'file':
      return <FileEditor block={block} onChange={onChange} />;
    case 'check':
      return <CheckEditor block={block} onChange={onChange} />;
  }
}
