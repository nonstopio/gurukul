import type { Block } from '@gurukul/schema';
import { isPlaceholderVideo, videoEmbedUrl } from '@gurukul/schema';
import { Toggle, VideoBlock } from '@gurukul/ui';
import { useEffect, useRef, useState } from 'react';
import { log } from '../log';
import { trackLoom, trackYouTube } from './videoTrack';
import type { Tracker } from './videoTrack';
import { WATCH_SHARE, WatchLog } from './watch';

type VideoBlockData = Extract<Block, { type: 'video' }>;

/** A loaded player that has not answered by now is treated as one that cannot be tracked. */
export const READY_TIMEOUT_MS = 15000;

const TRACKERS: Partial<Record<VideoBlockData['provider'], Tracker>> = {
  youtube: trackYouTube,
  loom: trackLoom,
};

/** The embed address, with YouTube's player API switched on for this page. */
export function trackedSrc(block: VideoBlockData): string | null {
  const src = videoEmbedUrl(block.provider, block.url);
  if (!src || block.provider !== 'youtube') return src;
  return `${src}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
}

/**
 * A lesson video whose watching gates "Mark complete". YouTube and Loom report how much has been
 * played; a Drive video, a link that cannot be embedded or a player that never answers falls back
 * to the learner saying they watched it. `onWatched` says whether this video is done with.
 */
export function TrackedVideo({
  block,
  onWatched,
}: {
  block: VideoBlockData;
  onWatched: (blockId: string, watched: boolean) => void;
}) {
  const comingSoon = isPlaceholderVideo(block.url);
  const src = comingSoon ? null : trackedSrc(block);
  const tracker = src ? TRACKERS[block.provider] : undefined;
  const frame = useRef<HTMLIFrameElement>(null);
  const [share, setShare] = useState(0);
  const [lost, setLost] = useState(false);
  const [attested, setAttested] = useState(false);
  const tracked = !!tracker && !lost;
  const watched = comingSoon || (tracked ? share >= WATCH_SHARE : attested);

  useEffect(() => onWatched(block.id, watched), [onWatched, block.id, watched]);

  useEffect(() => {
    const el = frame.current;
    if (!tracker || !el) return;
    const watchLog = new WatchLog();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let answered = false;
    const giveUp = (reason: string) => {
      log.warn('Video watch tracking unavailable', {
        blockId: block.id,
        source: block.provider,
        reason,
      });
      setLost(true);
    };
    const startClock = () => {
      if (!answered) timer ??= setTimeout(() => giveUp('timeout'), READY_TIMEOUT_MS);
    };
    el.addEventListener('load', startClock);
    const stop = tracker(el, {
      ready: () => {
        answered = true;
        clearTimeout(timer);
      },
      time: (seconds, duration) => {
        watchLog.sample(seconds, duration);
        setShare(watchLog.share());
      },
      fail: () => giveUp('load-failed'),
    });
    return () => {
      stop();
      clearTimeout(timer);
      el.removeEventListener('load', startClock);
    };
  }, [tracker, block.id, block.provider]);

  const percent = Math.round(share * 100);
  const status = tracked
    ? watched
      ? 'Watched'
      : `Watched ${percent}% · ${Math.round(WATCH_SHARE * 100)}% needed to finish the lesson`
    : undefined;
  const caption =
    block.caption && status ? `${block.caption} — ${status}` : (block.caption ?? status);
  if (comingSoon)
    return (
      <VideoBlock
        className="tracked-video"
        src=""
        title={block.title ?? 'Lesson video'}
        href={block.url}
        caption={block.caption}
        placeholder="Video coming soon."
      />
    );
  return (
    <div className="tracked-video">
      {src ? (
        <VideoBlock
          src={src}
          title={block.title ?? 'Lesson video'}
          href={block.url}
          frameRef={frame}
          caption={caption}
        />
      ) : (
        <p>
          <a href={block.url} target="_blank" rel="noopener noreferrer">
            Open the video in a new tab
          </a>
        </p>
      )}
      {tracked ? null : (
        <Toggle
          label="I have watched the video"
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
        />
      )}
    </div>
  );
}
