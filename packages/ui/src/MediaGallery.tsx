// A gallery of media tiles (image thumbnail or a typed icon tile) and the larger preview for one.

import { useState } from 'react';
import { cx } from './cx';
import { EmbedIcon, FileIcon, ImageIcon, PlayIcon } from './Icon';
import './media-gallery.css';

export type MediaKind = 'image' | 'video' | 'embed' | 'pdf' | 'audio' | 'file';

const KINDS: Record<MediaKind, { name: string; Glyph: typeof FileIcon }> = {
  image: { name: 'Image', Glyph: ImageIcon },
  video: { name: 'Video', Glyph: PlayIcon },
  embed: { name: 'Embed', Glyph: EmbedIcon },
  pdf: { name: 'PDF', Glyph: FileIcon },
  audio: { name: 'Audio', Glyph: PlayIcon },
  file: { name: 'File', Glyph: FileIcon },
};

/** The display name of a media kind ("Image", "PDF"), for filter chips and detail lines. */
export const mediaKindName = (kind: MediaKind): string => KINDS[kind].name;

export interface MediaPreviewProps {
  kind: MediaKind;
  /** The asset address. Only an image uses it, as its thumbnail; anything else shows its typed tile. */
  url?: string | undefined;
  /** `large` is the detail-panel size. Default: `tile`. */
  size?: 'tile' | 'large';
}

/** A real thumbnail for an image; a typed icon tile for everything else, and for an image that fails to load. */
export function MediaPreview({ kind, url, size = 'tile' }: MediaPreviewProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const { name, Glyph } = KINDS[kind];
  const showImage = kind === 'image' && url !== undefined && failed !== url;
  return (
    <span
      className={cx('g-media__preview', `g-media__preview--${size}`, `g-media__preview--${kind}`)}
    >
      {showImage ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(url)} />
      ) : (
        <>
          <Glyph size={size === 'large' ? 32 : 24} />
          <span className="g-media__kind">{name}</span>
        </>
      )}
    </span>
  );
}

export interface MediaGalleryItem {
  /** Stable and unique. */
  id: string;
  name: string;
  /** The second line, for example "PDF · used in 3 courses". */
  meta: string;
  kind: MediaKind;
  url?: string | undefined;
}

export interface MediaGalleryProps {
  /** Accessible name of the list, for example "Media". */
  label: string;
  items: MediaGalleryItem[];
  /** The `id` of the chosen tile, shown pressed. */
  selectedId?: string | null | undefined;
  onSelect: (item: MediaGalleryItem) => void;
}

/** A responsive grid of tile buttons. Choosing one calls `onSelect`; the page shows its detail. */
export function MediaGallery({ label, items, selectedId, onSelect }: MediaGalleryProps) {
  return (
    <ul className="g-media" aria-label={label}>
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="g-media__tile"
            aria-pressed={item.id === selectedId}
            onClick={() => onSelect(item)}
          >
            <MediaPreview kind={item.kind} url={item.url} />
            <span className="g-media__name">{item.name}</span>
            <span className="g-media__meta">{item.meta}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
