import type { AnswerKeys, Course, CourseAccess, CourseListing, Question } from '@gurukul/schema';

/** `courses/{id}/drafts/current`, with dates as `Date`. */
export interface DraftDoc {
  rev: number;
  updatedAt: Date | null;
  updatedBy: string;
  course: Course;
  answers: AnswerKeys;
  /** An answer key was edited since the last publish; see `markAnswerEdits`. */
  answersChanged?: true;
}

/** The working copy an editor changes: a course and its answer keys. */
export interface Working {
  course: Course;
  answers: AnswerKeys;
  /**
   * Set once an answer key differs from the stored draft's, and kept until a publish removes it:
   * published keys cannot be read in the browser, so this is how Publish knows they changed.
   */
  answersChanged?: true;
}

/**
 * One course opened in Studio (Media, Question bank): the copy the person works on. `draft` is set
 * when they may edit it, and `live` is then the draft's course; otherwise `live` is the published one.
 */
export interface StudioCourse {
  live: Course;
  draft: DraftDoc | null;
}

/** What a card on the Studio list adds to the course's summary, for a course the person may edit. */
export interface CourseFacts {
  /** The draft was saved after the last publish; false for a course never published; null when it cannot be read. */
  edited: boolean | null;
  /** Learners who have started the course, from its stats document; null when it cannot be read. */
  learners: number | null;
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
  /**
   * The summary of every course, never-published ones included: no course, draft or stats is read.
   * Remembered for five minutes; `forgetCourses` and `saveDraft` drop it.
   */
  listLiveCourses(): Promise<CourseListing[]>;
  /**
   * For one card of a course the person may edit: whether its draft has edits not yet published
   * (a count, no document) and how many learners started it. Two reads, remembered like the list.
   */
  courseFacts(courseId: string, publishedAt: CourseListing['publishedAt']): Promise<CourseFacts>;
  /** Drops the remembered list and card facts; called when this tab changes what they show. */
  forgetCourses(): Promise<void>;
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
  /** Who may open the course stays as it is; `setCourseAccess` changes it. */
  publishCourse(request: { courseId: string }): Promise<{ version: number }>;
  /** Who may open the course, applied to the live course at once without a new version. */
  setCourseAccess(request: { courseId: string } & CourseAccess): Promise<CourseAccess>;
  /** Publishes an earlier snapshot as a NEW version. */
  rollbackCourse(request: { courseId: string; version: number }): Promise<{ version: number }>;
  archiveCourse(request: {
    courseId: string;
    archived: boolean;
  }): Promise<{ status: 'archived' | 'published' }>;
}

/** One file going to Cloud Storage: where, what it is, and how to tell the caller about it. */
export interface MediaUploadRequest {
  /** `courses/{courseId}/media/{mediaId}.{ext}`; made once in the browser, never reused. */
  path: string;
  file: Blob;
  metadata: {
    contentType: string;
    cacheControl: string;
    customMetadata: Record<string, string>;
  };
  /** Percent uploaded, 0 to 100, as the bytes go. */
  onProgress: (percent: number) => void;
  /** Aborting stops the upload; the promise then rejects with `UploadCancelledError`. */
  signal: AbortSignal;
}

/**
 * The Cloud Storage SDK behind a port, so it loads in its own chunk and tests fake it. Resolves
 * with the file's download URL. A failure rejects with the SDK's error, which carries a `code`
 * such as `storage/unauthorized`.
 */
export interface MediaStorage {
  upload(request: MediaUploadRequest): Promise<string>;
}

/** What publishing needs to know about where uploads live; see `validateForPublish`. */
export interface PublishChecks {
  /** The project's Storage bucket. */
  bucket?: string | undefined;
  /** The Storage emulator's `host:port`, only when running against the emulators. */
  emulatorHost?: string | undefined;
}
