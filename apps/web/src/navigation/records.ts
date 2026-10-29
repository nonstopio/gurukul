// Record results for global search: things with an id, not pages. Each source turns data the
// person can already read into destinations; GlobalSearch loads them on first open and ranks them
// with the pages. A new source (people, draft courses) is one more function here and one more
// entry where the sources are built (`Shell.tsx`).

import type { Course, Lesson } from '@gurukul/schema';
import type { LearnerData } from '../data/types';
import { log } from '../log';
import { allowed } from './catalog';
import type { Destination, RecordSource, Role } from './types';

const LEVELS: Record<Course['level'], string> = {
  foundation: 'Foundation',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/**
 * Each course, then each of its lessons, as the catalogue shows them. Parikshas are left out:
 * they open from the outline, in order. A lesson still locked opens to its "Locked for now" note.
 */
export function courseDestinations(courses: readonly Course[]): Destination[] {
  return courses.flatMap((c) => [
    {
      id: `course:${c.id}`,
      path: `/courses/${c.id}`,
      label: c.title,
      areaName: 'Catalogue',
      description: c.status === 'archived' ? `${c.summary} · Retired` : c.summary,
      keywords: [LEVELS[c.level], 'course'],
      kind: 'Course',
    },
    ...c.parvas.flatMap((p) =>
      p.items
        .filter((i): i is Lesson => i.type === 'lesson')
        .map((l) => ({
          id: `lesson:${c.id}/${l.id}`,
          path: `/courses/${c.id}/learn/${l.id}`,
          label: l.title,
          areaName: c.title,
          description: p.title,
          keywords: l.kindLabel ? [l.kindLabel, 'lesson'] : ['lesson'],
          kind: 'Lesson',
        })),
    ),
  ]);
}

/** Published and archived courses, from the same bounded query the catalogue makes. */
export function courseSource(data: Pick<LearnerData, 'listCourses'>): RecordSource {
  return { id: 'courses', load: async () => courseDestinations(await data.listCourses()) };
}

/**
 * Every source this person may use, loaded together. A source that fails is logged and left out,
 * so pages and the other sources still search.
 */
export async function loadRecords(
  sources: readonly RecordSource[],
  roles: readonly Role[],
): Promise<Destination[]> {
  const loads = sources
    .filter((s) => allowed(s.roles, roles))
    .map((s) =>
      s.load().catch((error: unknown) => {
        log.warn('Search records not loaded', {
          source: s.id,
          code: (error as { code?: unknown }).code,
        });
        return [];
      }),
    );
  return (await Promise.all(loads)).flat();
}
