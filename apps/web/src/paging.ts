import { DEFAULT_PAGE_SIZE, pageOf } from '@gurukul/ui';

/**
 * The page to show and its rows. A page past the end (the last row of the last page was deleted, or
 * a refresh returned fewer rows) falls back to the last one, so a list is never blank while rows
 * remain. Reset `page` to 1 where a filter or search changes. See `.claude/rules/pagination.md`.
 */
export function pageFor<T>(
  rows: readonly T[],
  page: number,
  pageSize = DEFAULT_PAGE_SIZE,
): { page: number; rows: T[] } {
  const last = Math.max(1, Math.ceil(rows.length / pageSize));
  const at = Math.min(Math.max(1, page), last);
  return { page: at, rows: pageOf(rows, at, pageSize) };
}
