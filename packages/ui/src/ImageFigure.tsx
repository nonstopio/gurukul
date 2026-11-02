// A lesson image: laid out as a column, medium or small figure, optionally framed, optionally opening
// full size in a Dialog, and a quiet alt-text box when the file does not load.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';
import { Dialog } from './Dialog';
import './image-figure.css';

export type ImageLayout = 'column' | 'medium' | 'small';

export interface ImageFigureProps {
  src: string;
  /** What the image shows; also the text of the box that replaces an image that fails to load. */
  alt: string;
  /** `column` fills the lesson column, `medium` is two thirds of it, `small` at most 320px. Default: `column`. */
  layout?: ImageLayout | undefined;
  /** A thin frame round the image. Default: true. */
  border?: boolean | undefined;
  /** The image is a button that opens it at its natural size in a Dialog. Default: false. */
  zoom?: boolean | undefined;
  /** Intrinsic pixels, so the page does not jump while the image loads. */
  width?: number | undefined;
  height?: number | undefined;
  /** A line under the image (and under the full-size one). */
  caption?: ReactNode;
  /** Called with the image's natural size once it has loaded, for an editor that records it. */
  onSize?: ((size: { width: number; height: number }) => void) | undefined;
}

/** An image block as a learner sees it. */
export function ImageFigure({
  src,
  alt,
  layout = 'column',
  border = true,
  zoom = false,
  width,
  height,
  caption,
  onSize,
}: ImageFigureProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const broken = failed === src;
  const img = (
    <img
      className="g-figure__img"
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(src)}
      onLoad={(e) => {
        const { naturalWidth, naturalHeight } = e.currentTarget;
        if (naturalWidth > 0 && naturalHeight > 0) {
          onSize?.({ width: naturalWidth, height: naturalHeight });
        }
      }}
    />
  );
  return (
    <figure className={cx('g-figure', `g-figure--${layout}`, !border && 'g-figure--bare')}>
      {broken ? (
        <p className="g-figure__missing">{alt}</p>
      ) : zoom ? (
        <button
          type="button"
          className="g-figure__zoom"
          aria-label={`Open full size: ${alt}`}
          onClick={() => setOpen(true)}
        >
          {img}
        </button>
      ) : (
        img
      )}
      {caption ? <figcaption className="g-figure__caption">{caption}</figcaption> : null}
      <Dialog open={open} onClose={() => setOpen(false)} title={alt} size="lg">
        {/* A scrollable region must take focus so a keyboard can scroll it (axe: scrollable-region-focusable). */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <div className="g-figure__full" role="region" aria-label="Full size image" tabIndex={0}>
          <img src={src} alt={alt} />
        </div>
        {caption ? <p className="g-figure__caption">{caption}</p> : null}
      </Dialog>
    </figure>
  );
}
