import type { Course, LabelSet } from '@gurukul/schema';

/** One of my assignments, with dates already as `Date` so screens never touch Firestore types. */
export interface AssignmentRow {
  id: string;
  courseId: string;
  dueAt: Date | null;
  mandatory: boolean;
  status: 'assigned' | 'started' | 'completed';
  /** Who assigned it; `null` on assignments made before the name was stored. */
  assignedByName: string | null;
}

/** My progress in one course, reduced to what screens read. */
export interface ProgressRow {
  courseId: string;
  courseVersion: number;
  lastItemId: string | null;
  lastActiveAt: Date | null;
  completedItemIds: string[];
  quiz: Record<
    string,
    { best: number; passed: boolean; attempts: number; lastAttemptAt: Date | null }
  >;
  percent: number;
  completedAt: Date | null;
  certificateId: string | null;
}

/** One graded Quiz attempt, as `gradeAttempt` recorded it: what the result page rebuilds its review from. */
export interface AttemptRow {
  id: string;
  /** 0..1 */
  score: number;
  correctCount: number;
  total: number;
  passed: boolean;
  /** The questions drawn, in the order shown. */
  questionIds: string[];
  answers: Record<string, string[]>;
  results: { questionId: string; correct: boolean }[];
}

/** An issued certificate. Public by design (verification), so it carries no email. */
export interface CertificateRow {
  id: string;
  uid: string;
  learnerName: string;
  courseId: string;
  courseTitle: string;
  courseVersion: number;
  issuedAt: Date;
  signatoryName: string;
  signatoryRole: string;
  revoked: boolean;
  /** When it was revoked; null when valid, or revoked before the date was recorded. */
  revokedAt: Date | null;
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
  /** My most recent graded attempt at one Quiz, or `null` before the first. */
  latestAttempt(uid: string, courseId: string, quizId: string): Promise<AttemptRow | null>;
  /** One certificate by id; readable without signing in. */
  getCertificate(id: string): Promise<CertificateRow | null>;
  /** My certificates, newest first. */
  myCertificates(uid: string): Promise<CertificateRow[]>;
  /** Creates the progress document (self-enrolment or first open). A no-op if it exists. */
  startCourse(uid: string, course: Pick<Course, 'id' | 'version'>): Promise<void>;
  /** Appends a lesson to `completedItemIds` (a set union, so two tabs cannot lose each other's work). */
  completeItem(uid: string, courseId: string, itemId: string): Promise<void>;
  /** Moves the resume point. */
  setLastItem(uid: string, courseId: string, itemId: string): Promise<void>;
  /** The names of the teams an Admin made on the Teams page (`config/org.teams`); empty before any. */
  orgTeams(): Promise<string[]>;
  /** Sets my team (`users/{uid}.team`); the rules accept only a listed team, or `null`. */
  setTeam(uid: string, team: string | null): Promise<void>;
  /** Which names the app shows this person (`users/{uid}.labels`). */
  setLabels(uid: string, labels: LabelSet): Promise<void>;
}
