/** Gurukul roles. Everyone signed in is a Shishya; the others are granted. */
export type Role = 'shishya' | 'acharya' | 'kulapati';

/** One page somebody can open from global search (and, from M1, the sidebar). */
export interface PageNavigation {
  /** Stable, unique across the app. Used as the result id. */
  id: string;
  /** The route, exactly as in `routes.tsx`. */
  path: string;
  label: string;
  /** One line shown under the label in search results. */
  description?: string;
  /** Extra words people might type: synonyms, the Sanskrit or the English name. */
  keywords?: readonly string[];
  /** Who can open it. Omitted means everyone signed in. Any listed role is enough. */
  roles?: readonly Role[];
}

/**
 * One area's navigation metadata — plain data, no imports, no components, no functions.
 * Global search is generated from it; the validator checks it against `routes.tsx`.
 */
export interface AreaNavigation {
  slug: string;
  /** Shown as the second line of every result in this area. */
  name: string;
  /** Who can open anything in this area; a page may narrow it further. */
  roles?: readonly Role[];
  keywords?: readonly string[];
  pages: readonly PageNavigation[];
  /**
   * Routes this area owns that search must NOT offer, each with the reason. A route that needs a
   * record (a course id, a certificate id) cannot be a search result, because search has no record
   * to pass: declare it `{ context: 'why' }`. Anything else deliberately hidden is `{ excluded: 'why' }`.
   */
  unlisted?: Readonly<Record<string, { context: string } | { excluded: string }>>;
}

/** A page this person can open, flattened for search. */
export interface Destination {
  id: string;
  path: string;
  label: string;
  areaName: string;
  description: string;
  keywords: readonly string[];
}
