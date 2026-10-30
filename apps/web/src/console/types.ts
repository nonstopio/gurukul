import type {
  AssignSummary,
  Course,
  CourseStats,
  OrgConfig,
  Team,
  OrgStats,
  Reminder,
} from '@gurukul/schema';
import type { CertificateRow, ProgressRow } from '../data/types';

export interface UserRow {
  uid: string;
  email: string;
  displayName: string;
  /** Their Google picture, saved at sign-in; null when they have none. */
  photoURL?: string | null | undefined;
  team: string | null;
  roles: string[];
  grantedCourseIds: string[];
  createdAt: Date | null;
}

export interface AssignmentFull {
  id: string;
  email: string;
  uid: string | null;
  courseId: string;
  dueAt: Date | null;
  assignedAt: Date | null;
  mandatory: boolean;
  status: 'assigned' | 'started' | 'completed';
}

/**
 * One entry of the audit trail. `by` is the doer's name (or email, or the uid when their profile is
 * gone); `target` is resolved the same way when the action targets a person.
 */
export interface AuditRow {
  id: string;
  action: string;
  by: string;
  target: string | null;
  /** What the function recorded about the action; shown in words by `auditDetail`. */
  detail: Record<string, unknown>;
  at: Date | null;
}

/** Where the next audit page starts: just after the entry with this time and id. */
export interface AuditCursor {
  at: Date;
  id: string;
}

export interface AuditPage {
  rows: AuditRow[];
  nextCursor: AuditCursor | null;
}

/**
 * One graded Quiz attempt as the learner drawer shows it: when, the score and the verdict.
 * Deliberately not the learner's answers or the per-question results.
 */
export interface AttemptSummary {
  id: string;
  quizId: string;
  /** 0..1 */
  score: number;
  passed: boolean;
  at: Date | null;
}

/** One person who started a course, as its Educator sees them: a name and how far they got. */
export interface CourseLearner {
  uid: string;
  /** Empty when the name was not recorded (a learner who started before names were kept). */
  displayName: string;
  percent: number;
  lastActiveAt: Date | null;
}

export interface UserPage {
  rows: UserRow[];
  /** Pass back to get the next page; null on the last one. */
  nextCursor: string | null;
}

/**
 * What the Admin console reads, and the org settings it writes. Bounded queries only (see `firebase-cost.md`): pages of 25,
 * `limit` on every list, aggregates from the `stats` documents rather than per-learner reads.
 * A port, so screens are tested with a fake and `firebaseConsoleData` is the real thing.
 */
export interface ConsoleData {
  orgStats(): Promise<OrgStats>;
  courseStats(courseId: string): Promise<CourseStats>;
  /**
   * Who started one course, newest activity first (capped at 100): names from
   * `courses/{id}/learners`, progress from the course's progress documents. The rules let the
   * course's own Educators and Admins read both.
   */
  courseLearners(courseId: string): Promise<CourseLearner[]>;
  /** Pending invites and assignments for one course (or all, newest first, capped). */
  assignments(filter?: { courseId?: string }): Promise<AssignmentFull[]>;
  /**
   * Every assignment no one has claimed yet (pending invites) and every one overdue at `now`, so
   * the Learners tabs count past the newest assignments. Capped high; reads grow with these only.
   */
  openAssignments(now: Date): Promise<AssignmentFull[]>;
  /** How many assignments are overdue at `now`, org-wide: a count() aggregation, not loaded rows. */
  overdueCount(now: Date): Promise<number>;
  /**
   * The newest-active progress documents (capped at 100), for finding Quizzes failed twice
   * without reading every progress document.
   */
  recentProgress(): Promise<Array<ProgressRow & { uid: string }>>;
  usersPage(after: string | null, pageSize: number): Promise<UserPage>;
  /** Total people who have signed in, for "Showing 1–25 of N". */
  userCount(): Promise<number>;
  /** Progress documents for a set of people, to show courses and percent per row. */
  progressFor(uids: string[]): Promise<Array<ProgressRow & { uid: string }>>;
  certificatesFor(uid: string): Promise<CertificateRow[]>;
  /** Every course assigned to one email (capped), started or not: the learner drawer's list. */
  assignmentsFor(email: string): Promise<AssignmentFull[]>;
  /** One person's newest graded attempts at one Quiz (capped), newest first. */
  attemptsFor(uid: string, courseId: string, quizId: string): Promise<AttemptSummary[]>;
  /** People who have signed in whose email or name starts with `prefix` (at most 8, email matches first). */
  searchUsers(prefix: string): Promise<UserRow[]>;
  usersInTeam(team: string): Promise<UserRow[]>;
  /** Profiles for a page of people known only by their assignments (in chunks of 30). */
  usersByUid(uids: string[]): Promise<UserRow[]>;
  /** People holding a granted role (educator or admin), for Roles & access. */
  usersWithRole(role: 'educator' | 'admin'): Promise<UserRow[]>;
  /** Every course, drafts and never-published ones included (capped), for granting to an Educator. */
  allCourses(): Promise<Course[]>;
  /**
   * Which of these emails have signed in, which already hold ALL the given courses, and which
   * hold each course (so the preview can count per course).
   */
  knownEmails(emails: string[], courseIds: string[]): Promise<KnownEmails>;
  teams(): Promise<string[]>;
  /** `config/org`, with the defaults for anything not saved yet. */
  orgSettings(): Promise<OrgConfig>;
  /**
   * Saves `config/org` except its team names, which only the Teams page changes; the rules let
   * only an Admin, and only this shape.
   */
  saveOrgSettings(settings: OrgConfig): Promise<void>;
  /**
   * Every team with its members, by name: the `teams/` documents, plus each name in
   * `config/org.teams` that has none (a team made before teams had members) as a team with no members.
   */
  teamList(): Promise<Team[]>;
  /**
   * Creates (`previousName` null: fails when the id is taken) or updates a team, and keeps its name
   * in `config/org.teams` (replacing `previousName`) in the same transaction.
   */
  saveTeam(team: Team, previousName: string | null): Promise<void>;
  /** Deletes the team and its name from `config/org.teams`; profiles that picked it keep it. */
  deleteTeam(team: Team): Promise<void>;
  /** One page of audit entries, newest first, with people resolved to names. */
  auditPage(after: AuditCursor | null, pageSize: number): Promise<AuditPage>;
}

export interface KnownEmails {
  signedIn: Set<string>;
  assigned: Set<string>;
  byCourse: Record<string, Set<string>>;
}

export interface AssignRequest {
  courseIds: string[];
  emails: string[];
  dueAt: number | null;
  mandatory: boolean;
  reminder: Reminder;
  notify: boolean;
}

export interface AssignResult {
  summary: AssignSummary;
  assigned: number;
  notified: number;
  /** (course, email) pairs that could not be written; the page offers to retry them. */
  failed: { email: string; courseId: string }[];
}

export interface SetRolesRequest {
  uid: string;
  educator?: boolean;
  admin?: boolean;
  grantedCourseIds?: string[];
}

/** The Admin-only callable functions. */
export interface ConsoleService {
  assignCourses(request: AssignRequest): Promise<AssignResult>;
  setRoles(request: SetRolesRequest): Promise<{ roles: string[] }>;
  resetCooldown(request: { uid: string; courseId: string; quizId: string }): Promise<void>;
  remindLearners(request: {
    courseId?: string;
    emails?: string[];
  }): Promise<{ sent: number; skipped: number }>;
  revokeCertificate(request: { id: string; revoked?: boolean }): Promise<void>;
}
