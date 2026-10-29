import { countUnpublished, diffCourses, itemsOf } from '@gurukul/schema';
import type { Block, Course, CourseDiff, Item, PublishIssue } from '@gurukul/schema';
import type { TypeTileKind } from '@gurukul/ui';
import type { Terms } from '../labels/terms';
import type { StudioCourse } from './types';

/** Whether this person may edit a course: an Admin, or one of its Educators. */
export function canEdit(course: Pick<Course, 'educatorIds'>, uid: string, admin: boolean): boolean {
  return admin || course.educatorIds.includes(uid);
}

/**
 * Who a course's Educators are, for "View only — Educator: Asha Rao". Names come from the course's
 * `educatorNames`; Educators granted before names were stored count as "1 other". Null when there
 * are none, or no name is known.
 */
export function educatorSummary(
  course: Pick<Course, 'educatorIds' | 'educatorNames'>,
  t: Terms,
): { label: string; names: string } | null {
  const known = course.educatorIds.flatMap((id) => course.educatorNames[id] ?? []);
  if (known.length === 0) return null;
  const others = course.educatorIds.length - known.length;
  if (others > 0) known.push(`${others} ${others === 1 ? 'other' : 'others'}`);
  return {
    label: course.educatorIds.length === 1 ? t.Educator : t.Educators,
    names: known.join(', '),
  };
}

/** "just now", "5 min ago", "2 h ago", "3 d ago", then the date. */
export function relativeTime(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h ago`;
  if (minutes < 60 * 24 * 30) return `${Math.floor(minutes / (60 * 24))} d ago`;
  return date.toISOString().slice(0, 10);
}

/** A title for labels, with a stand-in while the field is empty. */
export function nameOf(title: string, fallback: string): string {
  return title.trim() || fallback;
}

/** What the type tile shows: a Quiz, a lesson built around a video or code, or plain reading. */
export function itemKind(item: Item): TypeTileKind {
  if (item.type === 'quiz') return 'quiz';
  const types = item.blocks.map((b) => b.type);
  if (types.includes('video')) return 'video';
  return types.includes('code') ? 'code' : 'reading';
}

export function itemMeta(item: Item): string {
  if (item.type === 'lesson') return `${item.minutes} min`;
  return `${item.questions.length} ${item.questions.length === 1 ? 'question' : 'questions'}`;
}

/** The editor that opens an item: the lesson editor or the Quiz builder. */
export function itemEditorPath(courseId: string, item: Pick<Item, 'id' | 'type'>): string {
  return item.type === 'quiz'
    ? `/studio/courses/${courseId}/quiz/${item.id}`
    : `/studio/courses/${courseId}/lessons/${item.id}`;
}

export type CourseTab = 'all' | 'published' | 'drafts';

export function tabCounts(rows: readonly StudioCourse[]): Record<CourseTab, number> {
  return {
    all: rows.length,
    published: rows.filter((r) => r.live.status === 'published').length,
    drafts: rows.filter((r) => r.live.status === 'draft').length,
  };
}

export function inTab(row: StudioCourse, tab: CourseTab): boolean {
  if (tab === 'all') return true;
  return row.live.status === (tab === 'published' ? 'published' : 'draft');
}

/** Edits the draft has that learners cannot see yet; null when there is no draft or nothing was ever published. */
export function unpublishedEdits(row: StudioCourse): number | null {
  if (!row.draft || row.live.version === 0) return null;
  return countUnpublished(diffCourses(row.live, row.draft.course));
}

export interface ChangeSummary {
  added: string[];
  edited: string[];
  removed: string[];
  courseChanged: boolean;
}

/** The titles behind `diffCourses`, for the publish dialog. `live` is null before the first publication. */
export function changeSummary(live: Course | null, draft: Course): ChangeSummary {
  const diff: CourseDiff = diffCourses(live, draft);
  const titles = new Map<string, string>(
    [...(live ? itemsOf(live) : []), ...itemsOf(draft)].map((i) => [i.id, i.title]),
  );
  const draftTitles = new Map(itemsOf(draft).map((i) => [i.id, i.title]));
  const named = (ids: string[], source: Map<string, string>) =>
    ids.map((id) => source.get(id) as string);
  return {
    added: named(diff.added, draftTitles),
    edited: named(diff.edited, draftTitles),
    removed: named(diff.removed, titles),
    courseChanged: diff.courseChanged,
  };
}

/** The publish problems carried by a `CRS_1003` error's `details.issues`, ignoring anything malformed. */
export function issuesFromDetails(details: Record<string, unknown>): PublishIssue[] {
  const raw = details['issues'];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (i): i is PublishIssue =>
      typeof i === 'object' &&
      i !== null &&
      typeof (i as PublishIssue).code === 'string' &&
      typeof (i as PublishIssue).message === 'string',
  );
}

export type MediaKind = 'video' | 'image' | 'embed' | 'file';

export const MEDIA_KINDS: readonly MediaKind[] = ['video', 'image', 'embed', 'file'];

export interface MediaUse {
  courseId: string;
  courseTitle: string;
  itemId: string;
  itemTitle: string;
}

export interface MediaEntry {
  kind: MediaKind;
  url: string;
  /** Alt text, title or label where the block has one; else the address. */
  label: string;
  usedIn: MediaUse[];
}

const mediaOf = (b: Block): { kind: MediaKind; url: string; label: string } | null => {
  switch (b.type) {
    case 'video':
      return { kind: 'video', url: b.url, label: b.url };
    case 'image':
      return { kind: 'image', url: b.url, label: nameOf(b.alt, b.url) };
    case 'embed':
      return { kind: 'embed', url: b.url, label: nameOf(b.title, b.url) };
    case 'file':
      return { kind: 'file', url: b.url, label: nameOf(b.label, b.url) };
    default:
      return null;
  }
};

/**
 * Every video, image, embed and file address used in the courses the person can see, one entry per
 * address with the lessons that use it. A course's draft is read where there is one, else its live copy.
 */
export function collectMedia(rows: readonly StudioCourse[]): MediaEntry[] {
  const found = new Map<string, MediaEntry>();
  for (const row of rows) {
    const course = row.draft?.course ?? row.live;
    for (const item of itemsOf(course)) {
      if (item.type !== 'lesson') continue;
      for (const block of item.blocks) {
        const media = mediaOf(block);
        if (!media) continue;
        const key = `${media.kind} ${media.url}`;
        const entry = found.get(key) ?? { ...media, usedIn: [] };
        if (!entry.usedIn.some((u) => u.courseId === course.id && u.itemId === item.id)) {
          entry.usedIn.push({
            courseId: course.id,
            courseTitle: course.title,
            itemId: item.id,
            itemTitle: item.title,
          });
        }
        found.set(key, entry);
      }
    }
  }
  return [...found.values()].sort(
    (a, b) => MEDIA_KINDS.indexOf(a.kind) - MEDIA_KINDS.indexOf(b.kind),
  );
}
