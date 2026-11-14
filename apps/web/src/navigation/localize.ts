import type { Terms } from '../labels/terms';
import type { Destination } from './types';

// Area metadata is written in the generic names; each known word is swapped for the person's own
// name where it is shown and matched. Case picks the key: "Learners" → t.Learners, "quiz" → t.quiz.
const WORD =
  /\b(?:[Ll]earners?|[Ee]ducators?|[Mm]anagers?|[Aa]dmins?|[Cc]hapters?|[Qq]uiz(?:zes)?|[Ss]tudio|[Aa]nalytics)\b/g;

/** One metadata string in the person's names. Write metadata so no "a"/"an" sits before a swapped word. */
export function localize(text: string, t: Terms): string {
  return text.replace(WORD, (w) => t[w as keyof Terms]);
}

// Pages whose whole label is a name (a sidebar item, a title). Matched exactly so descriptions and
// search keywords stay generic.
const NAMED: Record<string, (t: Terms) => string> = {
  Home: (t) => t.Home,
  Catalogue: (t) => t.Catalogue,
  Certificates: (t) => t.Certificates,
  Teams: (t) => t.Teams,
  'My teams': (t) => `My ${t.teams}`,
  'Question bank': (t) => t.QuestionBank,
};

/** A page label in the person's names: `localize`, plus the labels that are a name by themselves. */
export function localizeLabel(label: string, t: Terms): string {
  return NAMED[label]?.(t) ?? localize(label, t);
}

/**
 * A page as this person reads it. Keywords keep the generic words too, so "quiz" and "pariksha"
 * both find the question bank whichever names are on screen.
 */
export function localizePage(d: Destination, t: Terms): Destination {
  return {
    ...d,
    label: localizeLabel(d.label, t),
    areaName: localize(d.areaName, t),
    description: localize(d.description, t),
    keywords: [...d.keywords, d.label, ...d.keywords.map((k) => localize(k, t))],
  };
}
