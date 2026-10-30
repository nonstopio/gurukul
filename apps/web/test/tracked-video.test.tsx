import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@gurukul/schema';
import type { TrackEvents } from '../src/player/videoTrack';

const tracked = vi.hoisted(() => ({ on: null as TrackEvents | null, stop: vi.fn() }));
vi.mock('../src/player/videoTrack', () => {
  const tracker = (_frame: HTMLIFrameElement, on: TrackEvents) => {
    tracked.on = on;
    return tracked.stop;
  };
  return { trackYouTube: tracker, trackLoom: tracker };
});

const { READY_TIMEOUT_MS, TrackedVideo, trackedSrc } = await import('../src/player/TrackedVideo');

type Video = Extract<Block, { type: 'video' }>;
const video = (over: Partial<Video> = {}): Video => ({
  type: 'video',
  id: 'v1',
  provider: 'youtube',
  url: 'https://youtu.be/abc123',
  captions: true,
  ...over,
});

function show(block: Video) {
  const onWatched = vi.fn();
  const view = render(<TrackedVideo block={block} onWatched={onWatched} />);
  return { onWatched, ...view };
}
const frame = () => screen.getByTitle('Lesson video');
const on = () => tracked.on as TrackEvents;

beforeEach(() => {
  tracked.on = null;
  tracked.stop.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('trackedSrc', () => {
  it('switches on the YouTube player API for this origin, and leaves other providers alone', () => {
    expect(trackedSrc(video())).toBe(
      `https://www.youtube-nocookie.com/embed/abc123?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`,
    );
    expect(trackedSrc(video({ provider: 'loom', url: 'https://www.loom.com/share/x1' }))).toBe(
      'https://www.loom.com/embed/x1',
    );
    expect(trackedSrc(video({ url: 'https://example.com/v' }))).toBeNull();
  });
});

describe('TrackedVideo', () => {
  it('shows nothing for an unrecorded video and does not hold the lesson back', () => {
    const { onWatched } = show(video({ url: 'https://www.youtube.com/watch?v=TODO_RECORD_VIDEO' }));
    expect(screen.queryByText('Video coming soon.')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(onWatched).toHaveBeenLastCalledWith('v1', true);
    expect(tracked.on).toBeNull();
  });

  it('counts as watched at 90% played, and says how far along it is', () => {
    const { onWatched, unmount } = show(video());
    expect(onWatched).toHaveBeenLastCalledWith('v1', false);
    expect(screen.queryByRole('switch')).toBeNull();
    act(() => on().ready());
    act(() => {
      for (let t = 0; t < 5; t++) on().time(t, 10);
    });
    expect(screen.getByText('Watched 50% · 90% needed to finish the lesson')).toBeTruthy();
    act(() => {
      for (let t = 5; t < 9; t++) on().time(t, 10);
    });
    expect(screen.getByText('Watched')).toBeTruthy();
    expect(onWatched).toHaveBeenLastCalledWith('v1', true);
    unmount();
    expect(tracked.stop).toHaveBeenCalled();
  });

  it('shows the block title and caption alongside the watch status', () => {
    const { unmount } = show(video({ title: 'Tour', caption: 'Intro' }));
    expect(screen.getByTitle('Tour')).toBeTruthy();
    act(() => on().ready());
    expect(screen.getByText(/^Intro — Watched 0%/)).toBeTruthy();
    unmount();
    show(
      video({
        caption: 'Intro',
        provider: 'drive',
        url: 'https://drive.google.com/file/d/abc/view',
      }),
    );
    expect(screen.getByText('Intro')).toBeTruthy();
  });

  it('falls back to "I have watched the video" when the player API does not load', () => {
    const { onWatched } = show(video({ provider: 'loom', url: 'https://www.loom.com/share/x1' }));
    act(() => on().fail());
    const toggle = screen.getByRole('switch', { name: 'I have watched the video' });
    fireEvent.click(toggle);
    expect(onWatched).toHaveBeenLastCalledWith('v1', true);
  });

  it('falls back when a loaded player never answers, but not once it has', () => {
    vi.useFakeTimers();
    show(video());
    fireEvent.load(frame());
    fireEvent.load(frame());
    act(() => vi.advanceTimersByTime(READY_TIMEOUT_MS));
    expect(screen.getByRole('switch', { name: 'I have watched the video' })).toBeTruthy();
  });

  it('keeps tracking a player that answered, before or after it loaded', () => {
    vi.useFakeTimers();
    const first = show(video());
    fireEvent.load(frame());
    act(() => on().ready());
    act(() => vi.advanceTimersByTime(READY_TIMEOUT_MS));
    expect(screen.queryByRole('switch')).toBeNull();
    first.unmount();
    show(video());
    act(() => on().ready());
    fireEvent.load(frame());
    act(() => vi.advanceTimersByTime(READY_TIMEOUT_MS));
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('asks the learner for a Drive video or a link that cannot be embedded', () => {
    const drive = show(
      video({ provider: 'drive', url: 'https://drive.google.com/file/d/f1/view' }),
    );
    expect(frame()).toBeTruthy();
    expect(tracked.on).toBeNull();
    expect(screen.getByRole('switch', { name: 'I have watched the video' })).toBeTruthy();
    drive.unmount();
    show(video({ url: 'https://example.com/v' }));
    expect(screen.queryByTitle('Lesson video')).toBeNull();
    expect(screen.getByRole('link', { name: 'Open the video in a new tab' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'I have watched the video' })).toBeTruthy();
  });
});
