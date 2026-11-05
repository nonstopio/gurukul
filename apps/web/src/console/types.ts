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
  /** `teamId` of each team they are on (`users/{uid}.teamIds`); none until a team lists them. */
  teamIds: string[];
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
  /** People holding a granted role (educator, manager or admin), for Roles & access. */
  usersWithRole(role: GrantedRole): Promise<UserRow[]>;
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
   * only an Admin, and only this shape. `uploads` is written only when `settings` carries it.
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
  saveTeam(team: Team, previousName: string | null, options?: SaveTeamOptions): Promise<void>;
  /**
   * The teams whose `managerEmails` lists this email (lower-cased), by name: what a Manager may
   * read. The rules accept only this query from a Manager, never a read of every team.
   */
  managedTeams(email: string): Promise<Team[]>;
  /** Deletes the team and its name from `config/org.teams`; profiles that picked it keep it. */
  deleteTeam(team: Team): Promise<void>;
  /** One page of audit entries, newest first, with people resolved to names. */
  auditPage(after: AuditCursor | null, pageSize: number): Promise<AuditPage>;
  /** How many entries the audit trail holds, for the page count. */
  auditCount(): Promise<number>;
}

/** A role an Admin grants with `setRoles`; everyone is a Learner. */
export type GrantedRole = 'educator' | 'manager' | 'admin';

export interface SaveTeamOptions {
  /**
   * Whether a create first reads the team to refuse a taken id (default true). A Manager cannot
   * read a team that does not list them, nor one that does not exist yet, so their create writes
   * without reading: the rules then refuse a write over someone else's team as an update.
   */
  checkTaken?: boolean;
}

export interface KnownEmails {
  signedIn: Set<string>;
  assigned: Set<string>;
  byCourse: Record<string, Set<string>>;
}

/** `emails` (Admins only) or `teamIds` (Admins, and Managers for the teams they manage), never both. */
export type AssignRequest = {
  courseIds: string[];
  dueAt: number | null;
  mandatory: boolean;
  reminder: Reminder;
  notify: boolean;
} & ({ emails: string[]; teamIds?: never } | { teamIds: string[]; emails?: never });

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
  /** Taking it away also takes the person off every team's managers (`setRoles` does it). */
  manager?: boolean;
  admin?: boolean;
  grantedCourseIds?: string[];
}

export interface RemindRequest {
  courseId?: string;
  emails?: string[];
  teamId?: string;
}

/** One email Gurukul sends, filled with sample data. */
export interface EmailTemplateView {
  id: string;
  name: string;
  when: string;
  subject: string;
  body: string;
}

type AssignmentStatus = AssignmentFull['status'];

/** One assignment in a team report (`teamReport`). Never a Quiz score. Times in milliseconds. */
export interface TeamReportAssignment {
  assignmentId: string;
  courseId: string;
  courseTitle: string;
  status: AssignmentStatus;
  dueAt: number | null;
  /** 0 to 100. */
  percent: number;
  /** The team it was assigned through; a Manager may change only their teams' ones. */
  teamId: string | null;
}

export interface TeamReportMember {
  email: string;
  /** Null until the person signs in for the first time. */
  uid: string | null;
  displayName: string | null;
  assignments: TeamReportAssignment[];
}

/** What `teamReport` returns: the web's copy of the contract in `firebase/functions/src/team-report.ts`. */
export interface TeamReport {
  teamId: string;
  name: string;
  members: TeamReportMember[];
}

/** The callables of the Admin console and the Team area. Most are Admin-only; see each. */
export interface ConsoleService {
  assignCourses(request: AssignRequest): Promise<AssignResult>;
  setRoles(request: SetRolesRequest): Promise<{ roles: string[] }>;
  resetCooldown(request: { uid: string; courseId: string; quizId: string }): Promise<void>;
  /** A Manager must pass a `teamId` they manage; an Admin may, to narrow it to that team. */
  remindLearners(request: RemindRequest): Promise<{ sent: number; skipped: number }>;
  /** An Admin, or a Manager of the team. */
  teamReport(request: { teamId: string }): Promise<TeamReport>;
  /** A new due date (ms) or none; a Manager only for an assignment made through their team. */
  updateAssignment(request: {
    assignmentId: string;
    dueAt: number | null;
  }): Promise<{ assignmentId: string; dueAt: number | null }>;
  /** Takes the course off the person's list; their progress stays. Same access as the above. */
  removeAssignment(request: { assignmentId: string }): Promise<{ assignmentId: string }>;
  revokeCertificate(request: { id: string; revoked?: boolean }): Promise<void>;
  listEmailTemplates(): Promise<EmailTemplateView[]>;
  sendTestEmail(request: { templateId: string; recipients: string[] }): Promise<{ to: string[] }>;
}
