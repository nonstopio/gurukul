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
  InsertDivider,
  Menu,
  PlayIcon,
  PlusIcon,
  TextIcon,
  iconButtonClass,
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

/**
 * A quiet "+" on a divider above a block: a menu of the same block types as the palette, so a block
 * can be added in place instead of at the bottom and dragged up. `label` names where it goes.
 */
export function BlockInsert({ label, onAdd }: { label: string; onAdd: (type: BlockType) => void }) {
  return (
    <InsertDivider className="studio-insert">
      <Menu
        label={label}
        tip="Add block"
        trigger={<PlusIcon />}
        triggerClassName={iconButtonClass()}
        items={PALETTE.map(({ type, label: name }) => ({
          label: name,
          icon: createElement(ICONS[type], { size: 18 }),
          onSelect: () => onAdd(type),
        }))}
      />
    </InsertDivider>
  );
}
