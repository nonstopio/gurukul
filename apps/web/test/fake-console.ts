import { vi } from 'vitest';
import { courseStatsSchema, orgStatsSchema } from '@gurukul/schema';
import { DEFAULT_ORG_CONFIG } from '@gurukul/schema';
import type { CourseStats, OrgConfig, OrgStats } from '@gurukul/schema';
import type {
  ConsoleData,
  ConsoleService,
  AssignmentFull,
  AuditRow,
  UserRow,
} from '../src/console/types';

export const userRow = (n: number, over: Partial<UserRow> = {}): UserRow => ({
  uid: `u${n}`,
  email: `user${n}@nonstopio.com`,
  displayName: `User ${n}`,
  team: null,
  roles: ['shishya'],
  grantedCourseIds: [],
  createdAt: null,
  ...over,
});

export function fakeConsole(
  init: {
    users?: UserRow[];
    assignments?: AssignmentFull[];
    /** Pending and overdue assignments past the newest ones; defaults to those among `assignments`. */
    open?: AssignmentFull[];
    org?: Partial<OrgStats>;
    course?: Partial<CourseStats>;
    teams?: string[];
    count?: number;
    team?: UserRow[];
    found?: UserRow[];
    audit?: AuditRow[];
    settings?: Partial<OrgConfig>;
  } = {},
) {
  const users = init.users ?? [];
  const data: ConsoleData = {
    orgStats: vi.fn().mockResolvedValue(orgStatsSchema.parse(init.org ?? {})),
    courseStats: vi.fn().mockResolvedValue(courseStatsSchema.parse(init.course ?? {})),
    assignments: vi.fn().mockResolvedValue(init.assignments ?? []),
    openAssignments: vi.fn(async (now: Date) =>
      (init.open ?? init.assignments ?? []).filter(
        (a) =>
          a.uid === null ||
          (a.status !== 'completed' && a.dueAt !== null && a.dueAt.getTime() < now.getTime()),
      ),
    ),
    overdueCount: vi.fn(
      async (now: Date) =>
        (init.open ?? init.assignments ?? []).filter(
          (a) => a.status !== 'completed' && a.dueAt !== null && a.dueAt.getTime() < now.getTime(),
        ).length,
    ),
    usersPage: vi.fn().mockResolvedValue({ rows: users, nextCursor: null }),
    userCount: vi.fn().mockResolvedValue(init.count ?? users.length),
    progressFor: vi.fn().mockResolvedValue([]),
    certificatesFor: vi.fn().mockResolvedValue([]),
    assignmentsFor: vi.fn(async (email: string) =>
      (init.assignments ?? []).filter((a) => a.email === email),
    ),
    attemptsFor: vi.fn().mockResolvedValue([]),
    searchUsers: vi.fn().mockResolvedValue(init.found ?? []),
    usersInTeam: vi.fn().mockResolvedValue(init.team ?? []),
    usersByUid: vi.fn(async (uids: string[]) =>
      [...users, ...(init.team ?? []), ...(init.found ?? [])].filter((u) => uids.includes(u.uid)),
    ),
    usersWithRole: vi.fn(async (role: string) => users.filter((u) => u.roles.includes(role))),
    knownEmails: vi.fn().mockResolvedValue({ signedIn: new Set(), assigned: new Set() }),
    teams: vi.fn().mockResolvedValue(init.teams ?? []),
    auditLog: vi.fn().mockResolvedValue(init.audit ?? []),
    orgSettings: vi.fn().mockResolvedValue({ ...DEFAULT_ORG_CONFIG, ...init.settings }),
    saveOrgSettings: vi.fn().mockResolvedValue(undefined),
  };
  const service: ConsoleService = {
    assignCourses: vi.fn().mockResolvedValue({
      summary: { signedIn: 1, newInvites: 1, alreadyAssigned: 0, rejected: [] },
      assigned: 2,
      notified: 0,
    }),
    setRoles: vi.fn().mockResolvedValue({ roles: ['shishya', 'acharya'] }),
    resetCooldown: vi.fn().mockResolvedValue(undefined),
    remindLearners: vi.fn().mockResolvedValue({ sent: 1, skipped: 0 }),
    revokeCertificate: vi.fn().mockResolvedValue(undefined),
  };
  return { data, service };
}
