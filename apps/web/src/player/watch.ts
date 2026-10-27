import type { Block, Lesson } from '@gurukul/schema';

/** Share of a video that counts as watched (`video90`, `rules.requireVideoWatch`). */
export const WATCH_SHARE = 0.9;

/** Two samples further apart than this are a seek, not playback: the gap does not count. */
const MAX_STEP_SEC = 5;

/**
 * The seconds of one video a learner has actually played. Each player sample adds the whole
 * seconds since the previous sample, so dragging the scrubber to the end does not count as
 * watching it, and 2× playback still does.
 */
export class WatchLog {
  private readonly seen = new Set<number>();
  private last: number | null = null;
  private duration = 0;

  /** Records the playhead at `seconds` of a `duration`-second video. */
  sample(seconds: number, duration: number): void {
    if (duration > 0) this.duration = duration;
    const now = Math.floor(seconds);
    const from = this.last !== null && now > this.last && now - this.last <= MAX_STEP_SEC;
    for (let s = from ? (this.last as number) + 1 : now; s <= now; s++) this.seen.add(s);
    this.last = now;
  }

  /** 0..1 of the video played; 0 until the player has said how long it is. */
  share(): number {
    if (this.duration <= 0) return 0;
    return Math.min(1, this.seen.size / Math.ceil(this.duration));
  }
}

/** The lesson's video blocks. */
export function videosOf(lesson: Lesson): Array<Extract<Block, { type: 'video' }>> {
  return lesson.blocks.filter((b) => b.type === 'video');
}

/**
 * True when "Mark complete" must wait for the lesson's videos: the lesson says `video90`, or the
 * course requires watching and the lesson has a video. A lesson with no video has nothing to wait for.
 */
export function needsWatching(lesson: Lesson, requireVideoWatch: boolean): boolean {
  return videosOf(lesson).length > 0 && (lesson.completeWhen === 'video90' || requireVideoWatch);
}
