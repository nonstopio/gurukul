import type { AnswerKeys, Course, CourseAccess, Question } from '@gurukul/schema';

/** `courses/{id}/drafts/current`, with dates as `Date`. */
export interface DraftDoc {
  rev: number;
  updatedAt: Date | null;
  updatedBy: string;
  course: Course;
  answers: AnswerKeys;
}

/** The working copy an editor changes: a course and its answer keys. */
export interface Working {
  course: Course;
  answers: AnswerKeys;
}

/** A course as the Studio lists it: the live document and, where the person may edit it, its draft. */
export interface StudioCourse {
  live: Course;
  draft: DraftDoc | null;
  /** Learners who have started the course, from its stats document; absent when the person cannot see it. */
  learners?: number;
}

export interface VersionRow {
  version: number;
  publishedAt: Date | null;
  title: string;
}

/** A reusable question in the shared bank (`questionBank/{id}`), answers included. */
export interface BankQuestion {
  id: string;
  question: Question;
  answers: string[];
  tags: string[];
  createdBy: string;
}

/**
 * What the Studio reads and writes directly in Firestore (security rules are the gate). Drafts are
 * saved with an optimistic `rev` check; everything that changes what learners see goes through
 * `StudioService`, never through here.
 */
export interface StudioData {
  /** Every course the person can see: published and archived ones, plus the drafts they may edit. */
  listCourses(uid: string, admin: boolean): Promise<StudioCourse[]>;
  /** Who may open the live course (`visibility`, `visibleTeamIds`); public when it says nothing. */
  getAccess(courseId: string): Promise<CourseAccess>;
  getDraft(courseId: string): Promise<DraftDoc | null>;
  /** Saves with `baseRev`; throws `DraftConflictError` when the stored rev has moved on. */
  saveDraft(courseId: string, work: Working, baseRev: number, uid: string): Promise<number>;
  listVersions(courseId: string): Promise<VersionRow[]>;
  getVersion(courseId: string, version: number): Promise<Course | null>;
  questionBank(): Promise<BankQuestion[]>;
  addToBank(entry: Omit<BankQuestion, 'id' | 'createdBy'>, uid: string): Promise<string>;
  /** Rewrites an entry's question, answers and tags (its creator or an Admin; the rules enforce it). */
  updateInBank(id: string, entry: Omit<BankQuestion, 'id' | 'createdBy'>): Promise<void>;
  removeFromBank(id: string): Promise<void>;
  /** How many learners have completed this lesson (one count query; Admin and the course's Educators may run it). */
  completedCount(courseId: string, lessonId: string): Promise<number>;
}

export interface CreateCourseRequest {
  title: string;
  slug: string;
  level: Course['level'];
  theme: Course['cover']['theme'];
  duplicateFrom?: string | null;
}

/** The Studio's callable functions. Each returns the data of the API envelope. */
export interface StudioService {
  createCourse(request: CreateCourseRequest): Promise<{ courseId: string }>;
  /** `visibility` and `visibleTeamIds` set who may open the course; left out, they stay as they are. */
  publishCourse(
    request: { courseId: string } & Partial<CourseAccess>,
  ): Promise<{ version: number }>;
  /** Publishes an earlier snapshot as a NEW version. */
  rollbackCourse(request: { courseId: string; version: number }): Promise<{ version: number }>;
  archiveCourse(request: {
    courseId: string;
    archived: boolean;
  }): Promise<{ status: 'archived' | 'published' }>;
}
