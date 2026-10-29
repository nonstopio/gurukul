/** Gurukul roles. Everyone signed in is a Learner; the others are granted. */
export type Role = 'learner' | 'educator' | 'admin';

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
  /** What a record result is, shown on the right ("Course", "Lesson"). Omitted for a page. */
  kind?: string;
}

/**
 * Records search can offer besides pages: courses and lessons, and the courses someone may edit. Loaded
 * once, the first time the palette opens, only for the roles listed (omitted means everyone), and
 * only from data this person can already read. Matched by the same ranking as pages.
 */
export interface RecordSource {
  /** Stable name, used in logs when the load fails. */
  id: string;
  roles?: readonly Role[];
  load: () => Promise<Destination[]>;
}

/**
 * Records too many to load up front (people), looked up as the person types instead: from two
 * characters, once typing pauses, newest answer only. `find` gets the lower-cased prefix and must
 * make a bounded query. Roles and the rules apply as for a `RecordSource`.
 */
export interface RecordLookup {
  /** Stable name, used in logs when a lookup fails. */
  id: string;
  roles?: readonly Role[];
  find: (prefix: string) => Promise<Destination[]>;
}
