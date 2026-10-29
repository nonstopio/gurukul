import type { Terms } from '../labels/terms';
import type { Destination } from './types';

// Area metadata is written in the generic names; each known word is swapped for the person's own
// name where it is shown and matched. Case picks the key: "Learners" → t.Learners, "quiz" → t.quiz.
const WORD =
  /\b(?:[Ll]earners?|[Ee]ducators?|[Aa]dmins?|[Cc]hapters?|[Qq]uiz(?:zes)?|[Ss]tudio|[Aa]nalytics)\b/g;

/** One metadata string in the person's names. Write metadata so no "a"/"an" sits before a swapped word. */
export function localize(text: string, t: Terms): string {
  return text.replace(WORD, (w) => t[w as keyof Terms]);
}

/**
 * A page as this person reads it. Keywords keep the generic words too, so "quiz" and "pariksha"
 * both find the question bank whichever names are on screen.
 */
export function localizePage(d: Destination, t: Terms): Destination {
  return {
    ...d,
    label: localize(d.label, t),
    areaName: localize(d.areaName, t),
    description: localize(d.description, t),
    keywords: [...d.keywords, ...d.keywords.map((k) => localize(k, t))],
  };
}
