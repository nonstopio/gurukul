import type { AssignSummary, CourseStats, OrgStats, Reminder } from '@gurukul/schema';
import type { CertificateRow, ProgressRow } from '../data/types';

export interface UserRow {
  uid: string;
  email: string;
  displayName: string;
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

/** One entry of the audit trail. `by` is the doer's email when their profile is known, else the uid. */
export interface AuditRow {
  id: string;
  action: string;
  by: string;
  target: string | null;
  at: Date | null;
}

export interface UserPage {
  rows: UserRow[];
  /** Pass back to get the next page; null on the last one. */
  nextCursor: string | null;
}

/**
 * What the Kulapati console reads. Bounded queries only (see `firebase-cost.md`): pages of 25,
 * `limit` on every list, aggregates from the `stats` documents rather than per-learner reads.
 * A port, so screens are tested with a fake and `firebaseConsoleData` is the real thing.
 */
export interface ConsoleData {
  orgStats(): Promise<OrgStats>;
  courseStats(courseId: string): Promise<CourseStats>;
  /** Pending invites and assignments for one course (or all, newest first, capped). */
  assignments(filter?: { courseId?: string }): Promise<AssignmentFull[]>;
  usersPage(after: string | null, pageSize: number): Promise<UserPage>;
  /** Total people who have signed in, for "Showing 1–25 of N". */
  userCount(): Promise<number>;
  /** Progress documents for a set of people, to show courses and percent per row. */
  progressFor(uids: string[]): Promise<Array<ProgressRow & { uid: string }>>;
  certificatesFor(uid: string): Promise<CertificateRow[]>;
  /** Email-prefix search over people who have signed in. */
  searchUsers(prefix: string): Promise<UserRow[]>;
  usersInTeam(team: string): Promise<UserRow[]>;
  /** People holding a granted role (acharya or kulapati), for Roles & access. */
  usersWithRole(role: 'acharya' | 'kulapati'): Promise<UserRow[]>;
  /** Which of these emails have signed in, and which already hold an assignment for ALL given courses. */
  knownEmails(
    emails: string[],
    courseIds: string[],
  ): Promise<{ signedIn: Set<string>; assigned: Set<string> }>;
  teams(): Promise<string[]>;
  /** The newest audit entries (capped), with each doer's email resolved. */
  auditLog(): Promise<AuditRow[]>;
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
}

export interface SetRolesRequest {
  uid: string;
  acharya?: boolean;
  kulapati?: boolean;
  grantedCourseIds?: string[];
}

/** The Kulapati-only callable functions. */
export interface ConsoleService {
  assignCourses(request: AssignRequest): Promise<AssignResult>;
  setRoles(request: SetRolesRequest): Promise<{ roles: string[] }>;
  resetCooldown(request: { uid: string; courseId: string; parikshaId: string }): Promise<void>;
  remindLearners(request: {
    courseId?: string;
    emails?: string[];
  }): Promise<{ sent: number; skipped: number }>;
  revokeCertificate(request: { id: string; revoked?: boolean }): Promise<void>;
}
