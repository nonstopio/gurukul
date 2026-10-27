import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as VideoTrack from '../src/player/videoTrack';
import type { TrackEvents } from '../src/player/videoTrack';

type Mod = typeof VideoTrack;
type Win = Window & { YT?: unknown; onYouTubeIframeAPIReady?: () => void };
const w = window as Win;

/** A fresh module, so the once-per-page API promise starts empty in every test. */
async function fresh(): Promise<Mod> {
  vi.resetModules();
  return import('../src/player/videoTrack');
}

const events = () => ({
  ready: vi.fn<TrackEvents['ready']>(),
  time: vi.fn<TrackEvents['time']>(),
  fail: vi.fn<TrackEvents['fail']>(),
});

const apiScript = () => document.querySelector<HTMLScriptElement>('script[src*="iframe_api"]');

afterEach(() => {
  delete w.YT;
  delete w.onYouTubeIframeAPIReady;
  apiScript()?.remove();
  vi.useRealTimers();
});

describe('loadYouTubeApi', () => {
  it('uses an API already on the page', async () => {
    const { loadYouTubeApi } = await fresh();
    const YT = { Player: vi.fn() };
    w.YT = YT;
    await expect(loadYouTubeApi()).resolves.toBe(YT);
    expect(apiScript()).toBeNull();
  });

  it('adds the script once and resolves when YouTube calls back, keeping an earlier callback', async () => {
    const { loadYouTubeApi, YOUTUBE_API } = await fresh();
    const earlier = vi.fn();
    w.onYouTubeIframeAPIReady = earlier;
    const first = loadYouTubeApi();
    expect(loadYouTubeApi()).toBe(first);
    expect(apiScript()?.src).toBe(YOUTUBE_API);
    const YT = { Player: vi.fn() };
    w.YT = YT;
    w.onYouTubeIframeAPIReady?.();
    await expect(first).resolves.toBe(YT);
    expect(earlier).toHaveBeenCalled();
  });

  it('rejects when the script fails, and tries again next time', async () => {
    const { loadYouTubeApi } = await fresh();
    const first = loadYouTubeApi();
    apiScript()?.dispatchEvent(new Event('error'));
    await expect(first).rejects.toThrow('did not load');
    expect(apiScript()).toBeNull();
    const second = loadYouTubeApi();
    expect(second).not.toBe(first);
    expect(apiScript()).not.toBeNull();
    w.YT = { Player: vi.fn() };
    w.onYouTubeIframeAPIReady?.();
    await second;
  });
});

describe('trackYouTube', () => {
  type Options = {
    events: { onReady: () => void; onStateChange: (e: { data: number }) => void };
  };
  let options: Options;
  let now = 0;
  beforeEach(() => {
    now = 0;
    w.YT = {
      Player: vi.fn(function (this: unknown, _frame: unknown, o: Options) {
        options = o;
        return { getCurrentTime: () => now, getDuration: () => 60 };
      }),
    };
  });

  it('reports ready, samples while playing and stops sampling on pause', async () => {
    vi.useFakeTimers();
    const { trackYouTube, YOUTUBE_POLL_MS } = await fresh();
    const on = events();
    const stop = trackYouTube(document.createElement('iframe'), on);
    await vi.runAllTicks();
    await Promise.resolve();
    options.events.onReady();
    expect(on.ready).toHaveBeenCalled();
    options.events.onStateChange({ data: 1 });
    expect(on.time).toHaveBeenLastCalledWith(0, 60);
    now = 1;
    vi.advanceTimersByTime(YOUTUBE_POLL_MS);
    expect(on.time).toHaveBeenLastCalledWith(1, 60);
    options.events.onStateChange({ data: 2 });
    vi.advanceTimersByTime(YOUTUBE_POLL_MS * 3);
    expect(on.time).toHaveBeenCalledTimes(2);
    options.events.onStateChange({ data: 1 });
    stop();
    vi.advanceTimersByTime(YOUTUBE_POLL_MS * 3);
    expect(on.time).toHaveBeenCalledTimes(3);
    options.events.onReady();
    options.events.onStateChange({ data: 1 });
    expect(on.ready).toHaveBeenCalledTimes(1);
    expect(on.time).toHaveBeenCalledTimes(3);
  });

  it('creates no player when stopped before the API arrives', async () => {
    const { trackYouTube } = await fresh();
    trackYouTube(document.createElement('iframe'), events())();
    await Promise.resolve();
    await Promise.resolve();
    expect((w.YT as { Player: ReturnType<typeof vi.fn> }).Player).not.toHaveBeenCalled();
  });

  it('says it failed when the API does not load, unless it was stopped', async () => {
    delete w.YT;
    const { trackYouTube } = await fresh();
    const on = events();
    trackYouTube(document.createElement('iframe'), on);
    apiScript()?.dispatchEvent(new Event('error'));
    await vi.waitFor(() => expect(on.fail).toHaveBeenCalled());

    const quiet = events();
    trackYouTube(document.createElement('iframe'), quiet)();
    apiScript()?.dispatchEvent(new Event('error'));
    await Promise.resolve();
    await Promise.resolve();
    expect(quiet.fail).not.toHaveBeenCalled();
  });
});

describe('trackLoom', () => {
  function setup(mod: Mod) {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const post = vi.spyOn(frame.contentWindow as Window, 'postMessage');
    const on = events();
    const stop = mod.trackLoom(frame, on);
    const send = (data: unknown, over: Partial<MessageEventInit> = {}) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data,
          origin: 'https://www.loom.com',
          source: frame.contentWindow,
          ...over,
        }),
      );
    return { frame, post, on, stop, send };
  }

  it('asks for time updates on ready and on load, and reports them', async () => {
    const { frame, post, on, stop, send } = setup(await fresh());
    frame.dispatchEvent(new Event('load'));
    expect(JSON.parse(post.mock.calls[0]?.[0] as string)).toMatchObject({
      context: 'player.js',
      method: 'addEventListener',
      value: 'timeupdate',
    });
    send(JSON.stringify({ context: 'player.js', event: 'ready' }));
    send({ context: 'player.js', event: 'ready' });
    expect(on.ready).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(3);
    send({ context: 'player.js', event: 'timeupdate', value: { seconds: 4, duration: 40 } });
    expect(on.time).toHaveBeenCalledWith(4, 40);
    stop();
    frame.remove();
  });

  it('ignores other frames, other origins and anything that is not a player.js time update', async () => {
    const { on, stop, send } = setup(await fresh());
    const ready = { context: 'player.js', event: 'ready' };
    send(ready, { source: window });
    send(ready, { origin: 'https://evil.example' });
    send('not json');
    send(null);
    send(42);
    send({ context: 'other', event: 'ready' });
    send({ context: 'player.js', event: 'timeupdate' });
    send({ context: 'player.js', event: 'timeupdate', value: { seconds: '4', duration: 40 } });
    send({ context: 'player.js', event: 'timeupdate', value: { seconds: 4 } });
    send({ context: 'player.js', event: 'play' });
    expect(on.ready).not.toHaveBeenCalled();
    expect(on.time).not.toHaveBeenCalled();
    stop();
    send(ready);
    expect(on.ready).not.toHaveBeenCalled();
  });

  it('stops listening for load once stopped', async () => {
    const { frame, post, stop } = setup(await fresh());
    stop();
    frame.dispatchEvent(new Event('load'));
    expect(post).not.toHaveBeenCalled();
  });
});
