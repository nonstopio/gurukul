import { canOpen } from '@gurukul/schema';
import type { Audience, Course, CourseListing, Visibility } from '@gurukul/schema';
import type { ProgressRow } from '../data/types';

/** What a visibility reads as on a catalogue card and in the Studio publish dialog. */
export const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: 'Public',
  teams: 'Team only',
  staff: 'Educators and Admins',
};

export type CatalogueView = 'all' | 'assigned' | 'progress' | 'completed';
export type CatalogueSort = 'newest' | 'title' | 'time';

/** The catalogue's filters. All of them live in the URL, so back and reload keep them. */
export interface CatalogueQuery {
  q: string;
  view: CatalogueView;
  /** A level, or '' for any. */
  level: Course['level'] | '';
  sort: CatalogueSort;
}

export const DEFAULT_QUERY: CatalogueQuery = { q: '', view: 'all', level: '', sort: 'newest' };

export const VIEW_LABELS: Record<CatalogueView, string> = {
  all: 'All',
  assigned: 'Assigned to me',
  progress: 'In progress',
  completed: 'Completed',
};

export const SORT_LABELS: Record<CatalogueSort, string> = {
  newest: 'Newest first',
  title: 'Title A to Z',
  time: 'Shortest first',
};

const LEVELS = ['foundation', 'intermediate', 'advanced'] as const;
const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  allowed.find((a) => a === value) ?? fallback;

/** Reads the filters from search params; anything unknown falls back to its default. */
export function parseQuery(params: URLSearchParams): CatalogueQuery {
  return {
    q: params.get('q') ?? '',
    view: pick(params.get('show'), Object.keys(VIEW_LABELS) as CatalogueView[], 'all'),
    level: pick(params.get('level'), ['', ...LEVELS], ''),
    sort: pick(params.get('sort'), Object.keys(SORT_LABELS) as CatalogueSort[], 'newest'),
  };
}

/** The search params for a query: only what differs from the default, so a clean URL stays clean. */
export function queryParams(query: CatalogueQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q !== '') params.set('q', query.q);
  if (query.view !== 'all') params.set('show', query.view);
  if (query.level !== '') params.set('level', query.level);
  if (query.sort !== 'newest') params.set('sort', query.sort);
  return params;
}

/** How many filters are on (the sort is an order, not a filter). */
export const isFiltered = (query: CatalogueQuery): boolean =>
  query.q !== '' || query.view !== 'all' || query.level !== '';

/** Only what the person may open: the database already answers this, and this mirrors it. */
export function openable(courses: readonly CourseListing[], who: Audience): CourseListing[] {
  return courses.filter((c) => canOpen(c, who));
}

const millis = (c: CourseListing) => c.publishedAt?.toMillis() ?? 0;

/** The courses that match the query, in the chosen order. */
export function applyQuery(
  courses: readonly CourseListing[],
  query: CatalogueQuery,
  mine: { assignedIds: ReadonlySet<string>; progress: readonly ProgressRow[] },
): CourseListing[] {
  const needle = query.q.trim().toLowerCase();
  const progressOf = (id: string) => mine.progress.find((p) => p.courseId === id);
  const inView = (c: CourseListing) => {
    const p = progressOf(c.id);
    switch (query.view) {
      case 'all':
        return true;
      case 'assigned':
        return mine.assignedIds.has(c.id);
      case 'progress':
        return p !== undefined && p.completedAt === null;
      case 'completed':
        return p?.completedAt != null;
    }
  };
  const matches = (c: CourseListing) =>
    inView(c) &&
    (query.level === '' || c.level === query.level) &&
    (needle === '' ||
      c.title.toLowerCase().includes(needle) ||
      c.summary.toLowerCase().includes(needle));
  const order: Record<CatalogueSort, (a: CourseListing, b: CourseListing) => number> = {
    newest: (a, b) => millis(b) - millis(a),
    title: (a, b) => a.title.localeCompare(b.title),
    time: (a, b) => a.estimatedMinutes - b.estimatedMinutes,
  };
  return courses.filter(matches).sort(order[query.sort]);
}
