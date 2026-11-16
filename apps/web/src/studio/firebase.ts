import { accessOf, courseStatsSchema, migrateCourse } from '@gurukul/schema';
import type { AnswerKeys, Course } from '@gurukul/schema';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { COURSE_TTL_MS, listSummaries } from '../data/firebase';
import { log } from '../log';
import { DraftConflictError } from './errors';
import { sameWork } from './studioModel';
import type { BankQuestion, DraftDoc, StudioData, VersionRow } from './types';

type Ts = { toDate(): Date } | null | undefined;
const date = (t: Ts): Date | null => t?.toDate() ?? null;

const VERSION_LIMIT = 50;
const BANK_LIMIT = 200;

/** How many learners started the course (`stats/course_{id}`), or null when it cannot be read. */
async function learnersStarted(db: Firestore, courseId: string): Promise<number | null> {
  try {
    const snap = await getDoc(doc(db, 'stats', `course_${courseId}`));
    return courseStatsSchema.parse(snap.exists() ? snap.data() : {}).started;
  } catch {
    log.warn('Reading the learner count failed', { courseId });
    return null;
  }
}

const isTimestamp = (v: unknown): boolean =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { toMillis?: unknown }).toMillis === 'function';

/**
 * A copy safe to hand to Firestore: `undefined` fields are dropped (Firestore rejects them) and
 * Timestamps are kept as they are. Everything else is plain JSON data.
 */
export function cleanForFirestore<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => cleanForFirestore(v)) as T;
  if (value === null || typeof value !== 'object' || isTimestamp(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, cleanForFirestore(v)]),
  ) as T;
}

/**
 * A draft is work in progress: a cleared title or an empty answer is normal while editing, so it is
 * NOT held to the strict course schema (publishing is). Only the shape the editors rely on is
 * required: a course object with a `chapters` array.
 */
function draftCourse(raw: unknown): Course {
  const c = raw as { chapters?: unknown } | null;
  if (!c || typeof c !== 'object' || !Array.isArray(c.chapters)) {
    throw new Error('The draft is not a course');
  }
  return c as Course;
}

function toDraft(d: Record<string, unknown>): DraftDoc {
  return {
    rev: (d.rev as number | undefined) ?? 0,
    updatedAt: date(d.updatedAt as Ts),
    updatedBy: (d.updatedBy as string | undefined) ?? '',
    course: draftCourse(d.course),
    answers: (d.answers as AnswerKeys | undefined) ?? {},
    ...(d.answersChanged === true ? { answersChanged: true as const } : {}),
  };
}

export function firebaseStudioData(db: Firestore): StudioData {
  const draftRef = (courseId: string) => doc(db, 'courses', courseId, 'drafts', 'current');
  // The Studio list, Media, Question bank and search each ask for the list, and a card for its
  // facts: one promise each is reused for five minutes. Our own changes drop them (see
  // `forgetCourses`), so only someone else's edit waits.
  // ponytail: someone else's edit shows up within 5 minutes; listen to the courses if that matters.
  const kept = new Map<string, { at: number; promise: Promise<unknown> }>();
  function reused<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = kept.get(key);
    if (hit && Date.now() - hit.at < COURSE_TTL_MS) return hit.promise as Promise<T>;
    const promise = load();
    kept.set(key, { at: Date.now(), promise });
    // A failed read is not kept, so Retry asks again.
    promise.catch(() => kept.delete(key));
    return promise;
  }
  /**
   * Whether the draft was saved after the course was last published: a count of the drafts newer
   * than `publishedAt`, so one aggregation read and no document (a draft holds the whole course
   * and its answer keys). A publish leaves the draft's time alone and a rollback stamps both with
   * one time, so only a save moves it past. Null when it cannot be read.
   */
  async function editedSince(courseId: string, publishedAt: unknown): Promise<boolean | null> {
    try {
      const snap = await getCountFromServer(
        query(collection(db, 'courses', courseId, 'drafts'), where('updatedAt', '>', publishedAt)),
      );
      return snap.data().count > 0;
    } catch {
      log.warn('Reading the draft state failed', { courseId });
      return null;
    }
  }
  return {
    // Every status: the rules let an Educator or an Admin list every course and summary.
    listLiveCourses: () => reused('list', () => listSummaries(db, [[]])),
    courseFacts(courseId, publishedAt) {
      return reused(`facts/${courseId}`, async () => {
        const [edited, learners] = await Promise.all([
          // Never published: the card says Draft, and there is nothing to compare with.
          publishedAt === null ? false : editedSince(courseId, publishedAt),
          learnersStarted(db, courseId),
        ]);
        return { edited, learners };
      });
    },
    async forgetCourses() {
      kept.clear();
    },
    async getAccess(courseId) {
      return accessOf((await getDoc(doc(db, 'courses', courseId))).data());
    },
    async getDraft(courseId) {
      const snap = await getDoc(draftRef(courseId));
      return snap.exists() ? toDraft(snap.data()) : null;
    },
    async saveDraft(courseId, work, baseRev, uid) {
      const ref = draftRef(courseId);
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists() || snap.data().rev !== baseRev) throw new DraftConflictError();
        // The mark is decided against the draft as stored now, not as this tab loaded it: a publish
        // removes it without moving `rev`, so a tab open since then must not write it back unless
        // its keys still differ from the stored (now live) ones.
        const prior = snap.data();
        const marked =
          prior.answersChanged === true ||
          !sameWork(
            { course: work.course, answers: work.answers },
            { course: work.course, answers: prior.answers as AnswerKeys },
          );
        tx.update(ref, {
          rev: baseRev + 1,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
          course: cleanForFirestore(work.course),
          answers: cleanForFirestore(work.answers),
          // Never written false: only the publish function removes the mark.
          ...(marked ? { answersChanged: true } : {}),
        });
        return baseRev + 1;
      }).then((rev) => {
        kept.clear();
        return rev;
      });
    },
    async listVersions(courseId) {
      const snap = await getDocs(
        query(
          collection(db, 'courses', courseId, 'versions'),
          orderBy('version', 'desc'),
          limit(VERSION_LIMIT),
        ),
      );
      return snap.docs.map((d): VersionRow => {
        const v = d.data();
        return {
          version: v.version as number,
          publishedAt: date(v.publishedAt as Ts),
          title: ((v.course as { title?: string } | undefined)?.title ?? '') as string,
        };
      });
    },
    async getVersion(courseId, version) {
      const snap = await getDoc(doc(db, 'courses', courseId, 'versions', String(version)));
      return snap.exists() ? migrateCourse(snap.data().course) : null;
    },
    async questionBank() {
      const snap = await getDocs(
        query(collection(db, 'questionBank'), orderBy('createdAt', 'desc'), limit(BANK_LIMIT)),
      );
      return snap.docs.map((d): BankQuestion => {
        const b = d.data();
        return {
          id: d.id,
          question: b.question as BankQuestion['question'],
          answers: (b.answers as string[] | undefined) ?? [],
          tags: (b.tags as string[] | undefined) ?? [],
          createdBy: (b.createdBy as string | undefined) ?? '',
        };
      });
    },
    async addToBank(entry, uid) {
      const ref = await addDoc(collection(db, 'questionBank'), {
        question: cleanForFirestore(entry.question),
        answers: entry.answers,
        tags: entry.tags,
        createdBy: uid,
        createdAt: serverTimestamp(),
      });
      return ref.id;
    },
    async updateInBank(id, entry) {
      await updateDoc(doc(db, 'questionBank', id), {
        question: cleanForFirestore(entry.question),
        answers: entry.answers,
        tags: entry.tags,
      });
    },
    async removeFromBank(id) {
      await deleteDoc(doc(db, 'questionBank', id));
    },
    async completedCount(courseId, lessonId) {
      const snap = await getCountFromServer(
        query(
          collection(db, 'progress'),
          where('courseId', '==', courseId),
          where('completedItemIds', 'array-contains', lessonId),
        ),
      );
      return snap.data().count;
    },
  };
}
