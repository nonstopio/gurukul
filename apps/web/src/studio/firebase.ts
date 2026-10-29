import { courseStatsSchema, migrateCourse, readCourse } from '@gurukul/schema';
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
  serverTimestamp,
  where,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { log } from '../log';
import { DraftConflictError } from './errors';
import type { BankQuestion, DraftDoc, StudioCourse, StudioData, VersionRow } from './types';

type Ts = { toDate(): Date } | null | undefined;
const date = (t: Ts): Date | null => t?.toDate() ?? null;

const COURSE_LIMIT = 100;
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
 * required: a course object with a `parvas` array.
 */
function draftCourse(raw: unknown): Course {
  const c = raw as { parvas?: unknown } | null;
  if (!c || typeof c !== 'object' || !Array.isArray(c.parvas)) {
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
  };
}

export function firebaseStudioData(db: Firestore): StudioData {
  const draftRef = (courseId: string) => doc(db, 'courses', courseId, 'drafts', 'current');
  return {
    // Every Acharya and Kulapati sees every course, never-published ones included (the rules allow
    // it); only the drafts of courses they may edit are read.
    async listCourses(uid, kulapati) {
      const snap = await getDocs(query(collection(db, 'courses'), limit(COURSE_LIMIT)));
      const live: Course[] = [];
      for (const d of snap.docs) {
        const course = readCourse(d.data());
        if (course === null) log.warn('Unreadable course skipped', { courseId: d.id });
        else live.push(course);
      }
      return Promise.all(
        live.map(async (course): Promise<StudioCourse> => {
          const editable = kulapati || course.acharyaIds.includes(uid);
          if (!editable) return { live: course, draft: null };
          const [snap, learners] = await Promise.all([
            getDoc(draftRef(course.id)),
            learnersStarted(db, course.id),
          ]);
          const row: StudioCourse = {
            live: course,
            draft: snap.exists() ? toDraft(snap.data()) : null,
          };
          return learners === null ? row : { ...row, learners };
        }),
      );
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
        tx.update(ref, {
          rev: baseRev + 1,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
          course: cleanForFirestore(work.course),
          answers: cleanForFirestore(work.answers),
        });
        return baseRev + 1;
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
