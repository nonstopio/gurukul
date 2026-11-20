import type { CountBand } from '../../analytics/events';

/*
 * What the session events carry (`.plan/22-desktop-studio.md`, Privacy and security; the events in
 * `analytics/events.ts`): counts in bands, never a course id, a title, chat or course text, or an
 * email. Kept here, beside the session code, so it loads only in the desktop app.
 */

/** The band a count falls in: 0, 1-5, 6-20, 21-50 or 51+. */
export function countBand(n: number): CountBand {
  if (n <= 0) return '0';
  if (n <= 5) return '1-5';
  if (n <= 20) return '6-20';
  if (n <= 50) return '21-50';
  return '51+';
}

/** A saved or discarded session's size: its changes against the draft and its turns, in bands. */
export function sessionBands(changes: number, turns: number) {
  return { change_band: countBand(changes), turn_band: countBand(turns) };
}
