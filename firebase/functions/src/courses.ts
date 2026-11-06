import {
  ApiException,
  EDUCATOR_COURSE_ID,
  accessOf,
  blankCourse,
  courseAccessSchema,
  courseSchema,
  estimateMinutes,
  itemsOf,
  slug,
  upgradeCourse,
  validateForPublish,
} from '@gurukul/schema';
import type { AnswerKeys, Course, CourseAccess, PublishIssue } from '@gurukul/schema';
import { requireAdmin } from './errors.js';
import type { AuditEntry, Caller } from './errors.js';
import { log } from './logging/log.js';
import { badField, idField } from './validation.js';

/** The live course fields the Studio callables decide on. */
export interface LiveCourse {
  version: number;
  status: string;
  educatorIds: string[];
  /** Missing on a v1 document no role grant has touched yet. */
  educatorNames?: Record<string, string>;
  /** Who may open it; missing on a course published before visibility existed, which reads as public. */
  visibility?: CourseAccess['visibility'];
  visibleTeamIds?: string[];
}

export interface DraftData {
  rev: number;
  course: Course;
  answers: AnswerKeys;
  /** An answer key was edited since the last publish (Studio sets it; publishing removes it). */
  answersChanged?: boolean;
}

export interface VersionData {
  course: Course;
  answers: AnswerKeys;
}

/** Everything `release` loads inside its transaction. */
export interface ReleaseState {
  live: LiveCourse | undefined;
  draft: DraftData | undefined;
  snapshot: VersionData | undefined;
}

/** What a publish or rollback writes: the new live course, its answer keys and, for a rollback, the draft reset. */
export interface ReleasePlan {
  version: number;
  course: Course;
  /** Who may open the new live version; written beside the course object, not inside it. */
  access: CourseAccess;
  answers: AnswerKeys;
  resetDraft?: DraftData;
  /** Removes the draft's `answersChanged` mark: the keys it stood for are now live. */
  clearAnswersChanged?: boolean;
}

export interface NewCourse {
  courseId: string;
  uid: string;
  /** The blank live document. */
  course: Course;
  /** The first draft: blank, or a copy of the source's draft. */
  draft: { course: Course; answers: AnswerKeys };
}

/** Where the Studio callables read and write. `stores.ts` adapts the Admin SDK. */
export interface CourseStore {
  getLive(courseId: string): Promise<LiveCourse | undefined>;
  getDraft(courseId: string): Promise<{ course: Course; answers: AnswerKeys } | undefined>;
  /** Creates the live course, its draft (rev 1) and the grant on the creator's profile in one transaction; false when the id is taken. */
  create(plan: NewCourse): Promise<boolean>;
  /**
   * In one transaction: loads the live course, the draft and (when `loadVersion` is set) that
   * snapshot, runs `decide`, then writes the live course, `private/answers`, `versions/{n}` and,
   * when the plan resets it, the draft. Returns the new version.
   */
  release(
    courseId: string,
    uid: string,
    loadVersion: number | null,
    decide: (state: ReleaseState) => ReleasePlan,
  ): Promise<number>;
  setStatus(courseId: string, status: 'published' | 'archived'): Promise<void>;
  /** Writes who may open the course onto its live document; no new version. */
  setAccess(courseId: string, access: CourseAccess): Promise<void>;
  audit(entry: AuditEntry): Promise<void>;
}

const hasRole = (caller: Caller): boolean =>
  caller.claims?.educator === true || caller.claims?.admin === true;

/** The name Studio shows for the caller: the Google name, else the email's local part, as the profile does. */
const displayName = (caller: Caller): string | undefined =>
  caller.name?.trim() || caller.email?.split('@')[0] || undefined;

/**
 * An Admin, or an Educator the course lists. Being listed is not enough without the claim, as in
 * the rules' `isEducatorOf`: someone whose Educator role was taken away edits nothing.
 */
const canEdit = (caller: Caller, live: Pick<LiveCourse, 'educatorIds'>): boolean =>
  caller.claims?.admin === true ||
  (caller.claims?.educator === true && live.educatorIds.includes(caller.uid));

function field<T>(
  name: string,
  value: unknown,
  schema: {
    safeParse(
      v: unknown,
    ): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } };
  },
): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw badField(name, value, parsed.error.issues.map((i) => i.message).join('; '));
}

/** Keeps only the answers for questions the course has: stale keys of deleted questions are dropped. */
export function restrictAnswers(course: Course, answers: AnswerKeys): AnswerKeys {
  const out: AnswerKeys = {};
  for (const item of itemsOf(course)) {
    if (item.type !== 'quiz') continue;
    const keys: Record<string, string[]> = {};
    for (const q of item.questions) {
      const key = answers[item.id]?.[q.id];
      if (key !== undefined) keys[q.id] = key;
    }
    out[item.id] = keys;
  }
  return out;
}

/** `createCourse`: a blank course, or a copy of another course's draft, owned by the caller. */
export async function createCourse(
  store: CourseStore,
  caller: Caller,
  data: Record<string, unknown>,
): Promise<{ courseId: string }> {
  if (!hasRole(caller)) throw new ApiException('AUTH_2001', ['createCourse']);
  const title = field('title', data['title'], courseSchema.shape.title);
  const id = field('slug', data['slug'], slug);
  // The Educator course's address is the seed's: a course made there first would be the one the
  // seed then keeps, with its maker as Educator. Reported as taken, which from here it is.
  if (id === EDUCATOR_COURSE_ID) throw new ApiException('CRS_1002', [id]);
  const level = field('level', data['level'], courseSchema.shape.level);
  const theme = field('theme', data['theme'], courseSchema.shape.cover.shape.theme);
  const from = data['duplicateFrom'];
  const source = from === undefined || from === null ? undefined : idField('duplicateFrom', from);
  log.debug('Creating a course', { courseId: id, source: source ?? 'blank' });

  const educatorName = displayName(caller);
  const course = blankCourse({ id, title, level, theme, educatorId: caller.uid, educatorName });
  let draft = { course, answers: {} as AnswerKeys };
  if (source !== undefined) {
    const live = await store.getLive(source);
    if (live === undefined) throw new ApiException('CRS_2001', [source]);
    if (!canEdit(caller, live)) throw new ApiException('AUTH_2001', ['createCourse']);
    const copied = await store.getDraft(source);
    if (copied === undefined) throw new ApiException('CRS_2001', [source]);
    draft = {
      course: {
        ...copied.course,
        id,
        title,
        educatorIds: course.educatorIds,
        educatorNames: course.educatorNames,
        status: 'draft',
        version: 0,
        publishedAt: null,
      },
      answers: copied.answers,
    };
  }
  if (!(await store.create({ courseId: id, uid: caller.uid, course, draft }))) {
    throw new ApiException('CRS_1002', [id]);
  }
  await store.audit({
    action: 'course.create',
    by: caller.uid,
    target: id,
    detail: source === undefined ? {} : { duplicateFrom: source },
  });
  log.info('Course created', { courseId: id, uid: caller.uid });
  return { courseId: id };
}

function requireEditor(
  caller: Caller,
  live: LiveCourse | undefined,
  courseId: string,
  action: string,
): LiveCourse {
  if (live === undefined) throw new ApiException('CRS_2001', [courseId]);
  if (!canEdit(caller, live)) throw new ApiException('AUTH_2001', [action]);
  return live;
}

/** The live document after a release: the live Educators and their names are the authority, never the draft's. */
const released = (course: Course, live: LiveCourse, courseId: string, version: number): Course => ({
  ...course,
  id: courseId,
  educatorIds: live.educatorIds,
  educatorNames: live.educatorNames ?? {},
  status: 'published',
  version,
  estimatedMinutes: estimateMinutes(course),
});

/** The visibility a request asks for. */
function requestedAccess(data: Record<string, unknown>): CourseAccess {
  return field(
    'visibility',
    { visibility: data['visibility'], visibleTeamIds: data['visibleTeamIds'] ?? [] },
    courseAccessSchema,
  );
}

/** What publishing knows about where uploads live (`validateForPublish` options). */
export interface PublishChecks {
  bucket?: string;
  emulatorHost?: string;
}

/**
 * Inside the Functions emulator only: the Storage emulator's address, because its download URLs are
 * plain http. A production run passes nothing, so every address must be a `https://firebasestorage.googleapis.com`
 * download URL for its own file under this course. The bucket is deliberately not checked here: the
 * only name a function can read (`FIREBASE_CONFIG.storageBucket`) is the project's legacy default
 * (`demo-gurukul.appspot.com` in the emulator), which need not be the bucket Studio uploads to.
 * Studio checks the bucket in the browser.
 */
export function publishChecks(
  env: Record<string, string | undefined> = process.env,
): PublishChecks {
  const emulator = env['FIREBASE_STORAGE_EMULATOR_HOST'];
  return env['FUNCTIONS_EMULATOR'] === 'true' && emulator
    ? { emulatorHost: emulator.replace(/^localhost(?=:)/, '127.0.0.1') }
    : {};
}

/** `publishCourse`: validates the draft and makes it the live version. */
export async function publishCourse(
  store: CourseStore,
  caller: Caller,
  data: Record<string, unknown>,
  checks: PublishChecks = publishChecks(),
): Promise<{ version: number }> {
  const courseId = idField('courseId', data['courseId']);
  // A tab opened before access moved to `setCourseAccess` still sends its choice here; refuse it
  // rather than publish with that choice silently dropped.
  const stale = ['visibility', 'visibleTeamIds'].find((field) => field in data);
  if (stale !== undefined)
    throw new ApiException('VAL_1005', [stale, 'publishCourse'], { field: stale });
  log.debug('Publishing a course', { courseId });
  const version = await store.release(courseId, caller.uid, null, ({ live, draft }) => {
    const current = requireEditor(caller, live, courseId, 'publishCourse');
    // A retired course stays retired: publishing would quietly reopen grading and assignment.
    if (current.status === 'archived') throw new ApiException('CRS_1004', [courseId]);
    if (draft === undefined) throw new ApiException('CRS_2001', [courseId]);
    // A draft saved at an older schemaVersion is brought up to date before it is judged or published.
    const upgraded = upgradeCourse(draft.course) as Course;
    const issues: PublishIssue[] = validateForPublish(upgraded, draft.answers, checks);
    if (issues.length > 0) {
      log.warn('Publish refused', { courseId, count: issues.length });
      throw new ApiException('CRS_1003', [courseId], { issues });
    }
    const next = current.version + 1;
    const course = released(upgraded, current, courseId, next);
    // Who may open it is set apart (`setCourseAccess`), so a publish keeps what the course has.
    return {
      version: next,
      course,
      access: accessOf(current),
      answers: restrictAnswers(course, draft.answers),
      clearAnswersChanged: draft.answersChanged === true,
    };
  });
  await store.audit({
    action: 'course.publish',
    by: caller.uid,
    target: courseId,
    detail: { version },
  });
  log.info('Course published', { courseId, uid: caller.uid, count: version });
  return { version };
}

/**
 * `setCourseAccess`: who may open the course, applied to the live document at once without a new
 * version. On a course never published it waits there and the first publish keeps it (the rules
 * show a never-published course to Educators and Admins only, whatever it says).
 */
export async function setCourseAccess(
  store: CourseStore,
  caller: Caller,
  data: Record<string, unknown>,
): Promise<CourseAccess> {
  const courseId = idField('courseId', data['courseId']);
  const access = requestedAccess(data);
  log.debug('Setting who can open a course', { courseId });
  requireEditor(caller, await store.getLive(courseId), courseId, 'setCourseAccess');
  await store.setAccess(courseId, access);
  await store.audit({
    action: 'course.access',
    by: caller.uid,
    target: courseId,
    detail: { visibility: access.visibility, teams: access.visibleTeamIds.length },
  });
  log.info('Course access changed', { courseId, uid: caller.uid, status: access.visibility });
  return access;
}

/** `rollbackCourse`: publishes an old snapshot as a new version and resets the draft to it. */
export async function rollbackCourse(
  store: CourseStore,
  caller: Caller,
  data: Record<string, unknown>,
): Promise<{ version: number }> {
  const courseId = idField('courseId', data['courseId']);
  const from = data['version'];
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1) {
    throw badField('version', from, 'must be a whole number from 1');
  }
  log.debug('Rolling a course back', { courseId, count: from });
  const version = await store.release(courseId, caller.uid, from, ({ live, draft, snapshot }) => {
    const current = requireEditor(caller, live, courseId, 'rollbackCourse');
    if (current.status === 'archived') throw new ApiException('CRS_1004', [courseId]);
    if (snapshot === undefined) throw new ApiException('CRS_2002', [courseId, String(from)]);
    const next = current.version + 1;
    // An old snapshot is republished in today's shape, and the draft resets to that same shape.
    const restored = upgradeCourse(snapshot.course) as Course;
    return {
      version: next,
      course: released(restored, current, courseId, next),
      access: accessOf(current),
      answers: snapshot.answers,
      resetDraft: {
        rev: (draft?.rev ?? 0) + 1,
        course: restored,
        answers: snapshot.answers,
      },
    };
  });
  await store.audit({
    action: 'course.rollback',
    by: caller.uid,
    target: courseId,
    detail: { restoredVersion: from, version },
  });
  log.info('Course rolled back', { courseId, uid: caller.uid, count: version });
  return { version };
}

/** `archiveCourse`: Admin-only; retires a course or restores it to published. */
export async function archiveCourse(
  store: CourseStore,
  caller: Caller,
  data: Record<string, unknown>,
): Promise<{ status: 'published' | 'archived' }> {
  requireAdmin(caller, 'archiveCourse');
  const courseId = idField('courseId', data['courseId']);
  const archived = data['archived'];
  if (typeof archived !== 'boolean') throw badField('archived', archived, 'must be true or false');
  const live = await store.getLive(courseId);
  if (live === undefined) throw new ApiException('CRS_2001', [courseId]);
  if (!archived && live.version === 0) throw new ApiException('CRS_1001', [courseId]);
  const status = archived ? 'archived' : 'published';
  await store.setStatus(courseId, status);
  await store.audit({
    action: 'course.archive',
    by: caller.uid,
    target: courseId,
    detail: { status },
  });
  log.info('Course status changed', { courseId, uid: caller.uid, status });
  return { status };
}
