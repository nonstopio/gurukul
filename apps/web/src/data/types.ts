import type { Course } from '@gurukul/schema';

/** One of my assignments, with dates already as `Date` so screens never touch Firestore types. */
export interface AssignmentRow {
  id: string;
  courseId: string;
  dueAt: Date | null;
  mandatory: boolean;
  status: 'assigned' | 'started' | 'completed';
}

/** My progress in one course, reduced to what screens read. */
export interface ProgressRow {
  courseId: string;
  courseVersion: number;
  lastItemId: string | null;
  lastActiveAt: Date | null;
  completedItemIds: string[];
  pariksha: Record<string, { best: number; passed: boolean; attempts: number }>;
  percent: number;
  completedAt: Date | null;
  certificateId: string | null;
}

/**
 * Everything the learner screens need from the database, as a port: screens take one from context,
 * tests pass a fake, and `firebaseLearnerData` is the real thing. Reads are bounded (`limit`) to
 * stay inside the free quota.
 */
export interface LearnerData {
  /** Published and archived courses, newest first. */
  listCourses(): Promise<Course[]>;
  getCourse(courseId: string): Promise<Course | null>;
  myAssignments(uid: string): Promise<AssignmentRow[]>;
  myProgress(uid: string): Promise<ProgressRow[]>;
  /** Live updates of one progress document: `null` until the learner starts the course. */
  watchProgress(
    uid: string,
    courseId: string,
    cb: (progress: ProgressRow | null) => void,
  ): () => void;
  /** Creates the progress document (self-enrolment or first open). A no-op if it exists. */
  startCourse(uid: string, course: Pick<Course, 'id' | 'version'>): Promise<void>;
  /** Appends a lesson to `completedItemIds` (a set union, so two tabs cannot lose each other's work). */
  completeItem(uid: string, courseId: string, itemId: string): Promise<void>;
  /** Moves the resume point. */
  setLastItem(uid: string, courseId: string, itemId: string): Promise<void>;
}
