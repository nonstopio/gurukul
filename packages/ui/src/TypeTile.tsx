import { cx } from './cx';
import './type-tile.css';

export type TypeTileKind = 'reading' | 'video' | 'code' | 'pariksha';

export interface TypeTileProps {
  kind: TypeTileKind;
}

const KINDS: Record<TypeTileKind, { name: string; path: string }> = {
  reading: { name: 'Reading', path: 'M3 4h10M3 8h10M3 12h6' },
  video: { name: 'Video', path: 'M6 4.5v7l5.5-3.5z' },
  code: { name: 'Code', path: 'M6 4.5L2.5 8L6 11.5M10 4.5L13.5 8L10 11.5' },
  pariksha: {
    name: 'Pariksha',
    path: 'M2.5 4.5l1.2 1.2 2-2M2.5 10.5l1.2 1.2 2-2M8 5h5.5M8 11h5.5',
  },
};

/** A 30px tile that shows what kind of item a row is. The kind is also in visually hidden text. */
export function TypeTile({ kind }: TypeTileProps) {
  const { name, path } = KINDS[kind];
  return (
    <span className={cx('g-tile', `g-tile--${kind}`)}>
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={path} />
      </svg>
      <span className="g-tile__sr">{name}</span>
    </span>
  );
}
