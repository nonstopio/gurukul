import type { Block, BlockType } from '@gurukul/schema';

/** What every block editor receives: its block (controlled) and a way to replace it. */
export interface BlockEditorProps<T extends BlockType> {
  block: Extract<Block, { type: T }>;
  onChange: (block: Extract<Block, { type: T }>) => void;
}
