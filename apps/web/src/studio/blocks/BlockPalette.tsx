import type { BlockType } from '@gurukul/schema';
import {
  AlertIcon,
  ChecklistIcon,
  CodeIcon,
  EmbedIcon,
  FileIcon,
  ImageIcon,
  PlayIcon,
  TextIcon,
} from '@gurukul/ui';
import { createElement } from 'react';
import { PALETTE } from '../lessonEdit';

const ICONS: Record<BlockType, typeof TextIcon> = {
  markdown: TextIcon,
  video: PlayIcon,
  code: CodeIcon,
  callout: AlertIcon,
  image: ImageIcon,
  embed: EmbedIcon,
  file: FileIcon,
  check: ChecklistIcon,
};

/** "Add a block": a dashed box with one tile per block type. Choosing a tile calls `onAdd` with its type. */
export function BlockPalette({ onAdd }: { onAdd: (type: BlockType) => void }) {
  return (
    <section className="studio-add" id="studio-add" aria-labelledby="studio-add-title">
      <h2 className="studio-add__title" id="studio-add-title">
        Add a block
      </h2>
      <div className="studio-palette">
        {PALETTE.map(({ type, label }) => (
          <button
            key={type}
            type="button"
            className="studio-palette__tile"
            data-palette-tile
            onClick={() => onAdd(type)}
          >
            {createElement(ICONS[type], { size: 20 })}
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
