import { describe, expect, it } from 'vitest';
import type { Lesson } from '@gurukul/schema';
import { WatchLog, needsWatching, videosOf } from '../src/player/watch';
import { lesson } from './fake-data';

const video = {
  type: 'video',
  id: 'v',
  provider: 'youtube',
  url: 'https://youtu.be/a',
  captions: true,
};
const asLesson = (over: object) => lesson('l', over) as unknown as Lesson;

describe('WatchLog', () => {
  it('is 0 until the player says how long the video is', () => {
    const log = new WatchLog();
    expect(log.share()).toBe(0);
    log.sample(3, 0);
    expect(log.share()).toBe(0);
  });

  it('counts the seconds played, including those between samples at 2× speed', () => {
    const log = new WatchLog();
    for (let t = 0; t < 10; t += 2) log.sample(t, 10);
    // 0..8 played: nine whole seconds of ten.
    expect(log.share()).toBeCloseTo(0.9);
    log.sample(9.5, 10);
    expect(log.share()).toBe(1);
  });

  it('does not count a seek to the end, or a seek back, as watching', () => {
    const log = new WatchLog();
    log.sample(0, 100);
    log.sample(95, 100);
    expect(log.share()).toBeCloseTo(0.02);
    log.sample(10, 100);
    log.sample(10, 100);
    expect(log.share()).toBeCloseTo(0.03);
  });

  it('never goes above 1', () => {
    const log = new WatchLog();
    for (let t = 0; t <= 6; t++) log.sample(t, 4.5);
    expect(log.share()).toBe(1);
  });
});

describe('needsWatching', () => {
  it('waits on video90 lessons and, when the course asks, on any lesson with a video', () => {
    const withVideo = asLesson({ blocks: [video] });
    expect(videosOf(withVideo)).toHaveLength(1);
    expect(needsWatching(withVideo, false)).toBe(false);
    expect(needsWatching(withVideo, true)).toBe(true);
    expect(needsWatching(asLesson({ blocks: [video], completeWhen: 'video90' }), false)).toBe(true);
  });

  it('has nothing to wait for in a lesson without a video', () => {
    expect(needsWatching(asLesson({ completeWhen: 'video90' }), true)).toBe(false);
  });
});
