import type { BlockType } from '@gurukul/schema';
import {
  AlertIcon,
  Button,
  Card,
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

/** "Add a block": one button per block type. Choosing one calls `onAdd` with its type. */
export function BlockPalette({ onAdd }: { onAdd: (type: BlockType) => void }) {
  return (
    <Card title="Add a block" id="studio-add">
      <div className="studio-palette">
        {PALETTE.map(({ type, label }) => (
          <Button
            key={type}
            variant="secondary"
            icon={createElement(ICONS[type], { size: 18 })}
            data-palette-tile
            onClick={() => onAdd(type)}
          >
            {label}
          </Button>
        ))}
      </div>
    </Card>
  );
}
