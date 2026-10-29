import { cx } from './cx';
import { ChecklistIcon, CodeIcon, PlayIcon, TextIcon } from './Icon';
import './type-tile.css';

export type TypeTileKind = 'reading' | 'video' | 'code' | 'quiz';

export interface TypeTileProps {
  kind: TypeTileKind;
}

const KINDS: Record<TypeTileKind, { name: string; Glyph: typeof TextIcon }> = {
  reading: { name: 'Reading', Glyph: TextIcon },
  video: { name: 'Video', Glyph: PlayIcon },
  code: { name: 'Code', Glyph: CodeIcon },
  quiz: { name: 'Quiz', Glyph: ChecklistIcon },
};

/** A 30px tile that shows what kind of item a row is. The kind is also in visually hidden text. */
export function TypeTile({ kind }: TypeTileProps) {
  const { name, Glyph } = KINDS[kind];
  return (
    <span className={cx('g-tile', `g-tile--${kind}`)}>
      <Glyph />
      <span className="g-tile__sr">{name}</span>
    </span>
  );
}
