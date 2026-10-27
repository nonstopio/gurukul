import { itemsOf } from '@gurukul/schema';
import type { Course, Item, Pariksha, Question } from '@gurukul/schema';

/** Fisher–Yates on a copy; `rng` returns [0, 1) so tests can be deterministic. */
export function shuffle<T>(list: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * The questions a learner sees: a random subset of `questionsShown` from the pool (all of it when
 * the pool is no larger), with options shuffled when the Pariksha asks for it. Never mutates the course.
 */
export function pickQuestions(pariksha: Pariksha, rng: () => number = Math.random): Question[] {
  const picked =
    pariksha.questions.length > pariksha.questionsShown
      ? shuffle(pariksha.questions, rng).slice(0, pariksha.questionsShown)
      : [...pariksha.questions];
  return pariksha.shuffleOptions
    ? picked.map((q) => ({ ...q, options: shuffle(q.options, rng) }))
    : picked;
}

/** Milliseconds until a retake is allowed; 0 when it already is. */
export function cooldownRemaining(
  lastAttemptAt: Date | null,
  cooldownMinutes: number,
  now: Date,
): number {
  if (!lastAttemptAt) return 0;
  return Math.max(0, lastAttemptAt.getTime() + cooldownMinutes * 60_000 - now.getTime());
}

/** "6 minutes", "1 minute", "less than a minute". */
export function formatWait(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (ms <= 0 || minutes < 1) return 'less than a minute';
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/** The item after `itemId` in reading order, if any. */
export function itemAfter(course: Pick<Course, 'parvas'>, itemId: string): Item | undefined {
  const items = itemsOf(course);
  return items[items.findIndex((i) => i.id === itemId) + 1];
}

/** Where to open an item: a lesson in the player, a Pariksha in its own screen. */
export function itemPath(courseId: string, item: Pick<Item, 'id' | 'type'>): string {
  return item.type === 'pariksha'
    ? `/courses/${courseId}/pariksha/${item.id}`
    : `/courses/${courseId}/learn/${item.id}`;
}

/** LinkedIn's "add certification" link with the organisation, credential id and verify URL. */
export function linkedInUrl(c: {
  title: string;
  credentialId: string;
  verifyUrl: string;
  issuedAt: Date;
}): string {
  const q = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: c.title,
    organizationName: 'NonStop io',
    issueYear: String(c.issuedAt.getUTCFullYear()),
    issueMonth: String(c.issuedAt.getUTCMonth() + 1),
    certId: c.credentialId,
    certUrl: c.verifyUrl,
  });
  return `https://www.linkedin.com/profile/add?${q.toString()}`;
}

/** "9 November 2026", in UTC so the day never shifts with the viewer's timezone. */
export function longDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
