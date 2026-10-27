/**
 * Where a video's playhead comes from. YouTube through its IFrame API, Loom through the player.js
 * messages its embed speaks. Drive has no player API, so a Drive video cannot be tracked.
 */

/** What a tracker tells the player. */
export interface TrackEvents {
  /** The player answered: from now on, `time` reports arrive while it plays. */
  ready: () => void;
  /** The playhead is at `seconds` of a `duration`-second video. */
  time: (seconds: number, duration: number) => void;
  /** The player API could not be loaded; the video cannot be tracked. */
  fail: () => void;
}

/** Starts tracking one embedded player; returns the function that stops it. */
export type Tracker = (frame: HTMLIFrameElement, on: TrackEvents) => () => void;

/** The parts of the YouTube IFrame API used here. */
interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
}
interface YTApi {
  Player: new (
    frame: HTMLIFrameElement,
    options: {
      events: { onReady: () => void; onStateChange: (e: { data: number }) => void };
    },
  ) => YTPlayer;
}
type YTWindow = Window & { YT?: YTApi; onYouTubeIframeAPIReady?: () => void };

export const YOUTUBE_API = 'https://www.youtube.com/iframe_api';
/** `YT.PlayerState.PLAYING`. */
const PLAYING = 1;
/** How often a playing YouTube video is sampled. */
export const YOUTUBE_POLL_MS = 1000;

let youtubeApi: Promise<YTApi> | null = null;

/** Loads the YouTube IFrame API once per page; a failed load is retried by the next video. */
export function loadYouTubeApi(): Promise<YTApi> {
  const w = window as YTWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  youtubeApi ??= new Promise<YTApi>((resolve, reject) => {
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(w.YT as YTApi);
    };
    const script = document.createElement('script');
    script.src = YOUTUBE_API;
    script.async = true;
    script.onerror = () => {
      youtubeApi = null;
      script.remove();
      reject(new Error('YouTube IFrame API did not load'));
    };
    document.head.append(script);
  });
  return youtubeApi;
}

/** Tracks a YouTube embed (its `src` must carry `enablejsapi=1`). */
export const trackYouTube: Tracker = (frame, on) => {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const halt = () => {
    clearInterval(timer);
    timer = undefined;
  };
  loadYouTubeApi().then(
    (YT) => {
      if (stopped) return;
      const player = new YT.Player(frame, {
        events: {
          onReady: () => {
            if (!stopped) on.ready();
          },
          onStateChange: ({ data }) => {
            halt();
            if (stopped || data !== PLAYING) return;
            const sample = () => on.time(player.getCurrentTime(), player.getDuration());
            sample();
            timer = setInterval(sample, YOUTUBE_POLL_MS);
          },
        },
      });
    },
    () => {
      if (!stopped) on.fail();
    },
  );
  return () => {
    stopped = true;
    halt();
  };
};

/** A player.js message from an embed: a JSON string, or the object itself. */
function playerJs(data: unknown): { event?: string; value?: unknown } | null {
  let message: unknown = data;
  if (typeof data === 'string') {
    try {
      message = JSON.parse(data);
    } catch {
      return null;
    }
  }
  const m = message as { context?: unknown } | null;
  return m && typeof m === 'object' && m.context === 'player.js'
    ? (m as { event?: string; value?: unknown })
    : null;
}

/** Tracks a Loom embed through the player.js protocol. */
export const trackLoom: Tracker = (frame, on) => {
  const post = (method: string, value?: string) =>
    frame.contentWindow?.postMessage(
      JSON.stringify({ context: 'player.js', version: '0.0.11', method, value }),
      'https://www.loom.com',
    );
  const listen = () => post('addEventListener', 'timeupdate');
  let ready = false;
  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow || e.origin !== 'https://www.loom.com') return;
    const m = playerJs(e.data);
    if (m?.event === 'ready') {
      if (!ready) on.ready();
      ready = true;
      listen();
    } else if (m?.event === 'timeupdate') {
      const v = m.value as { seconds?: unknown; duration?: unknown } | undefined;
      if (typeof v?.seconds === 'number' && typeof v.duration === 'number') {
        on.time(v.seconds, v.duration);
      }
    }
  };
  window.addEventListener('message', onMessage);
  // The embed announces "ready" once, possibly before this listener existed: asking on load
  // makes a ready player answer anyway.
  frame.addEventListener('load', listen);
  return () => {
    window.removeEventListener('message', onMessage);
    frame.removeEventListener('load', listen);
  };
};
