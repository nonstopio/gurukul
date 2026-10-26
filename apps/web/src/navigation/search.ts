// Local, deterministic matching for global search. No network, no debounce, no dependency.
//
// The catalog is a few hundred destinations at most, so a linear scan over fields normalised once
// (indexDestinations, run when the catalog changes) costs well under a millisecond per keystroke —
// test/navigation-search.test.ts measures it against 1,000.
//
// Ranking, best first:
//   1000  the label IS the query                      "changelog"     → Changelog
//    900  the label starts with the query             "change"        → Changelog
//    700  every term matches the area/label path      "gurukul home"  → Gurukul › Home
//         (+10 per term that lands in the label itself)
//    500  the label contains the query                "log"           → Changelog
//    300  every term matches once keywords count      "release notes" → Changelog
// Ties keep catalog order (area file name, then page order), so the same query always gives the
// same list.
//
// No typo tolerance yet. Add a bounded edit distance on single terms if people miss with
// near-misses in practice.

import type { Destination } from './types';

/** Lower-case, accents stripped, every run of punctuation one space. */
export function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const words = (...parts: string[]) => parts.flatMap((p) => normalize(p).split(' ')).filter(Boolean);

export interface IndexedDestination {
  d: Destination;
  order: number;
  label: string;
  labelWords: string[];
  path: string[];
  pathText: string;
  all: string[];
  allText: string;
}

/** Precompute the searchable form of each destination. Run when the catalog changes. */
export function indexDestinations(destinations: readonly Destination[]): IndexedDestination[] {
  return destinations.map((d, order) => {
    const path = words(d.areaName, d.label);
    const all = path.concat(words(d.description, ...d.keywords));
    return {
      d,
      order,
      label: normalize(d.label),
      labelWords: words(d.label),
      path,
      pathText: path.join(' '),
      all,
      allText: all.join(' '),
    };
  });
}

// A term matches when a word starts with it, or — from three characters — sits inside the text.
const termHits = (t: string, list: string[], text: string) =>
  list.some((w) => w.startsWith(t)) || (t.length >= 3 && text.includes(t));
const allHit = (terms: string[], list: string[], text: string) =>
  terms.every((t) => termHits(t, list, text));

function score(e: IndexedDestination, q: string, terms: string[]): number {
  if (e.label === q) return 1000;
  if (e.label.startsWith(q)) return 900;
  if (allHit(terms, e.path, e.pathText)) {
    return 700 + 10 * terms.filter((t) => e.labelWords.some((w) => w.startsWith(t))).length;
  }
  if (e.label.includes(q)) return 500;
  if (allHit(terms, e.all, e.allText)) return 300;
  return 0;
}

/** Rank the index against a query. An empty query returns every destination, in catalog order. */
export function searchDestinations(
  index: readonly IndexedDestination[],
  query: string,
): Destination[] {
  const q = normalize(query);
  if (!q) return index.map((e) => e.d);
  const terms = q.split(' ');
  return index
    .map((e) => ({ e, s: score(e, q, terms) }))
    .filter((h) => h.s > 0)
    .sort((a, b) => b.s - a.s || a.e.order - b.e.order)
    .map((h) => h.e.d);
}
