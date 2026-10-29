// Record results for global search: things with an id, not pages. Each source turns data the
// person can already read into destinations; GlobalSearch loads them on first open and ranks them
// with the pages. A new source is one more function here and one more entry where the sources are
// built (`Shell.tsx`). People are too many to load up front, so they are a
// `RecordLookup` instead: looked up by prefix as the person types.

import type { Course, Lesson } from '@gurukul/schema';
import type { ConsoleData, UserRow } from '../console/types';
import type { LearnerData } from '../data/types';
import { canEdit } from '../studio/studioModel';
import type { StudioCourse, StudioData } from '../studio/types';
import type { Terms } from '../labels/terms';
import { log } from '../log';
import { allowed } from './catalog';
import type { Destination, RecordLookup, RecordSource, Role } from './types';

const LEVELS: Record<Course['level'], string> = {
  foundation: 'Foundation',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/**
 * Each course, then each of its lessons, as the catalogue shows them. Quizzes are left out:
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
    ...c.chapters.flatMap((p) =>
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

const STATUS: Record<Course['status'], string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

/**
 * Each course this person may edit, drafts never published included, opening the course editor.
 * Titled as Studio shows it: from the draft when there is one.
 */
export function editableCourseDestinations(
  rows: readonly StudioCourse[],
  uid: string,
  admin: boolean,
  t: Terms,
): Destination[] {
  return rows
    .filter((r) => canEdit(r.live, uid, admin))
    .map(({ live, draft }) => {
      const shown = draft?.course ?? live;
      return {
        id: `studio:${live.id}`,
        path: `/studio/courses/${live.id}`,
        label: shown.title,
        areaName: t.Studio,
        description: `${STATUS[live.status]} · ${shown.summary}`,
        keywords: [STATUS[live.status], 'edit', 'course'],
        kind: 'Course',
      };
    });
}

/** For Educators and Admins: Studio's own course list (the same reads as `/studio`). */
export function editableCourseSource(
  data: Pick<StudioData, 'listCourses'>,
  uid: string,
  admin: boolean,
  t: Terms,
): RecordSource {
  return {
    id: 'editable-courses',
    roles: ['educator', 'admin'],
    load: async () => editableCourseDestinations(await data.listCourses(uid, admin), uid, admin, t),
  };
}

/** Where a person found in search opens: the Learners page, with their drawer open. */
export const learnerPath = (uid: string) => `/admin/learners?learner=${encodeURIComponent(uid)}`;

/** Each person by name, with their email (and team) underneath; matched by either. */
export function personDestinations(users: readonly UserRow[], t: Terms): Destination[] {
  return users.map((u) => ({
    id: `person:${u.uid}`,
    path: learnerPath(u.uid),
    label: u.displayName || u.email,
    areaName: t.Learners,
    description: u.team ? `${u.email} · ${u.team}` : u.email,
    keywords: ['person', 'learner'],
    kind: 'Person',
  }));
}

/** People who signed in, for Admins: the Learners page's own bounded prefix search. */
export function peopleLookup(data: Pick<ConsoleData, 'searchUsers'>, t: Terms): RecordLookup {
  return {
    id: 'people',
    roles: ['admin'],
    find: async (prefix) => personDestinations(await data.searchUsers(prefix), t),
  };
}

/** A failed read is logged and gives nothing, so pages and the other records still search. */
const orNothing = (source: string, read: Promise<Destination[]>) =>
  read.catch((error: unknown): Destination[] => {
    log.warn('Search records not loaded', { source, code: (error as { code?: unknown }).code });
    return [];
  });

/** Every source this person may use, loaded together. */
export async function loadRecords(
  sources: readonly RecordSource[],
  roles: readonly Role[],
): Promise<Destination[]> {
  const loads = sources
    .filter((s) => allowed(s.roles, roles))
    .map((s) => orNothing(s.id, s.load()));
  return (await Promise.all(loads)).flat();
}

/** Every lookup given (already narrowed to this person's roles), for one prefix, together. */
export async function findRecords(
  lookups: readonly RecordLookup[],
  prefix: string,
): Promise<Destination[]> {
  return (await Promise.all(lookups.map((l) => orNothing(l.id, l.find(prefix))))).flat();
}
