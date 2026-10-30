import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './cx';
import { PlayIcon } from './Icon';
import './video-block.css';

export interface VideoBlockProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** The provider's embed URL. The caller chooses the provider and builds the URL. */
  src: string;
  /** Accessible name of the player frame; required. */
  title: string;
  /** Plain-page address of the same video, for the fallback link. */
  href: string;
  /** A line under the video. */
  caption?: ReactNode;
  /** Fallback link text. Default: "Open the video in a new tab". */
  linkLabel?: string;
  /** The player frame, for a caller that talks to the provider's player API. */
  frameRef?: Ref<HTMLIFrameElement>;
  /**
   * A video that is not recorded yet: the same 16:9 frame holds this message instead of a player,
   * and there is no link.
   */
  placeholder?: string | undefined;
}

/** A 16:9 embedded video with a caption and an always-visible link to open it elsewhere. */
export function VideoBlock({
  src,
  title,
  href,
  caption,
  linkLabel = 'Open the video in a new tab',
  frameRef,
  placeholder,
  className,
  ...rest
}: VideoBlockProps) {
  return (
    <figure className={cx('g-video', className)} {...rest}>
      <div className="g-video__frame">
        {placeholder ? (
          <p className="g-video__soon">
            <PlayIcon size={32} />
            {placeholder}
          </p>
        ) : (
          <iframe
            ref={frameRef}
            className="g-video__iframe"
            src={src}
            title={title}
            loading="lazy"
            allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}
      </div>
      {caption ? <figcaption className="g-video__caption">{caption}</figcaption> : null}
      {placeholder ? null : (
        <a className="g-video__link" href={href} target="_blank" rel="noopener noreferrer">
          {linkLabel}
        </a>
      )}
    </figure>
  );
}
