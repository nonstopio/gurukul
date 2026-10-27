import type { BlockType } from '@gurukul/schema';
import { PALETTE } from '../lessonEdit';

const ICONS: Record<BlockType, string> = {
  markdown: 'M3 4h10M3 8h10M3 12h6',
  video: 'M6 4.5v7l5.5-3.5z',
  code: 'M6 4.5L2.5 8L6 11.5M10 4.5L13.5 8L10 11.5',
  callout: 'M8 5v4M8 11.5v.01M2.5 8a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0 -11 0',
  image: 'M2.5 3.5h11v9h-11zM2.5 11l3.5-3.5 3 3 1.5-1.5 3 3',
  embed: 'M2.5 3.5h11v9h-11zM2.5 6.5h11',
  file: 'M4 2.5h5l3 3v8H4zM9 2.5v3h3',
  check: 'M2.5 8.5l3 3 6-7M13 12.5h-4',
};

/** "Add a block": a dashed box with one tile per block type. Choosing a tile calls `onAdd` with its type. */
export function BlockPalette({ onAdd }: { onAdd: (type: BlockType) => void }) {
  return (
    <section className="studio-add" aria-labelledby="studio-add-title">
      <h2 className="studio-add__title" id="studio-add-title">
        Add a block
      </h2>
      <div className="studio-palette">
        {PALETTE.map(({ type, label }) => (
          <button
            key={type}
            type="button"
            className="studio-palette__tile"
            onClick={() => onAdd(type)}
          >
            <svg
              viewBox="0 0 16 16"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={ICONS[type]} />
            </svg>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
