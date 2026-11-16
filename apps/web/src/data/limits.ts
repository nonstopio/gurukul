/**
 * Course summaries one list reads. Past it the list is cut, and says so (`CourseLimitNotice`).
 * ponytail: a list reads every summary it may show (0.5 KB each) and pages in memory; read a page
 * at a time with a cursor (`.claude/rules/pagination.md`) once the catalogue nears a few hundred.
 */
export const SUMMARY_LIMIT = 1000;

/** Whether a list reached `SUMMARY_LIMIT`, so courses past it are not shown. */
export const isCut = (courses: readonly unknown[]): boolean => courses.length >= SUMMARY_LIMIT;
