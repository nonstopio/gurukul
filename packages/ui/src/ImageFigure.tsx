// A lesson image: laid out as a column, medium or small figure, optionally framed, optionally opening
// full size in a Dialog, and a quiet alt-text box when the file does not load.

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { blurHashStyle } from './blurHashStyle';
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
  /**
   * A BlurHash of the image: shown at the `width` / `height` aspect, behind the image, until the
   * image has loaded, then faded out (not under reduced motion). Needs both sizes and a valid hash;
   * otherwise nothing extra renders. Decoration only: `aria-hidden`, no alt text.
   */
  blurHash?: string | undefined;
  /** A line under the image (and under the full-size one). */
  caption?: ReactNode;
  /** Called with the image's natural size once it has loaded, for an editor that records it. */
  onSize?: ((size: { width: number; height: number }) => void) | undefined;
}

/** How long the placeholder fades out; matches `--dur-slow` in `image-figure.css`. */
const FADE_MS = 400;

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** An image block as a learner sees it. */
export function ImageFigure({
  src,
  alt,
  layout = 'column',
  border = true,
  zoom = false,
  width,
  height,
  blurHash,
  caption,
  onSize,
}: ImageFigureProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const broken = failed === src;
  // The picture the placeholder gives way to: shown, then fading, then gone, per address.
  const [loaded, setLoaded] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const blur = useMemo(
    () => (width && height ? blurHashStyle(blurHash) : null),
    [blurHash, width, height],
  );
  useEffect(() => {
    if (loaded !== src) return;
    const timer = setTimeout(() => setGone(src), FADE_MS);
    return () => clearTimeout(timer);
  }, [loaded, src]);
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
        setLoaded(src);
        if (reducedMotion()) setGone(src);
        const { naturalWidth, naturalHeight } = e.currentTarget;
        if (naturalWidth > 0 && naturalHeight > 0) {
          onSize?.({ width: naturalWidth, height: naturalHeight });
        }
      }}
    />
  );
  // The frame stays once there is a placeholder, so the image never remounts when it goes.
  const framed = blur ? (
    <span
      className="g-figure__media"
      style={{ width: `min(100%, ${width}px)`, aspectRatio: `${width} / ${height}` }}
    >
      {img}
      {gone === src ? null : (
        <span
          aria-hidden="true"
          className={cx('g-figure__blur', loaded === src && 'g-figure__blur--out')}
          style={blur}
        />
      )}
    </span>
  ) : (
    img
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
          {framed}
        </button>
      ) : (
        framed
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
