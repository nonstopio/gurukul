import { z } from 'zod';
import { timestamp } from './timestamp';

export const roleSchema = z.enum(['learner', 'educator', 'admin']);
export type Role = z.infer<typeof roleSchema>;

/**
 * Which names the app shows a person: `generic` (Learner, Educator, Admin, Chapter, Quiz) or
 * `gurukul` (Shishya, Acharya, Kulapati, Parva, Pariksha). Display only: code and data always use
 * the generic names. Unset until the person picks one on first sign-in.
 */
export const labelSetSchema = z.enum(['generic', 'gurukul']);
export type LabelSet = z.infer<typeof labelSetSchema>;

export const userSchema = z.object({
  email: z.email(),
  displayName: z.string().max(120),
  /**
   * `nameKey(displayName)`, for people search by name (a prefix range query). Optional until every
   * profile made before it existed is filled in, which the app does on its owner's next sign-in.
   */
  nameLower: z.string().max(120).optional(),
  photoURL: z.string().nullable(),
  team: z.string().max(80).nullable(),
  /**
   * `teamId(name)` of every team (`teams/`) whose members include this email, kept by the functions
   * (never by the person), because a course's `teams` visibility reads it. Absent means none.
   */
  teamIds: z.array(z.string().max(80)).max(100).optional(),
  labels: labelSetSchema.optional(),
  roles: z.array(roleSchema).min(1),
  grantedCourseIds: z.array(z.string()),
  createdAt: timestamp,
});
export type UserProfile = z.infer<typeof userSchema>;

/** What `users/{uid}.nameLower` holds for a display name; the rules check the same `lower()`. */
export const nameKey = (displayName: string): string => displayName.toLowerCase();

/** `config/org`: the allowed domain, the teams a learner can pick, reminder settings and who signs certificates. */
export const orgConfigSchema = z.object({
  domain: z.string().min(1),
  teams: z.array(z.string().min(1).max(80)).max(100),
  reminders: z.object({ enabled: z.boolean() }),
  /** Printed on every certificate issued from now on; a certificate keeps the one it was issued with. */
  signatory: z.object({ name: z.string().min(1).max(120), role: z.string().min(1).max(120) }),
});
export type OrgConfig = z.infer<typeof orgConfigSchema>;

/**
 * `teams/{id}`: a team and its members, keyed by email so a person can be on a team before their
 * first sign-in. `config/org.teams` keeps the names only (what a learner picks from).
 */
export const teamSchema = z.object({
  name: z.string().trim().min(1).max(80),
  memberEmails: z.array(z.email().max(254)).max(500),
  /** Milliseconds since the epoch. */
  createdAt: z.number(),
});
export type TeamDoc = z.infer<typeof teamSchema>;
export type Team = TeamDoc & { id: string };

/** The document id for a team name: lower-case letters and digits joined by hyphens. */
export const teamId = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'team';

export const DEFAULT_ORG_CONFIG: OrgConfig = {
  domain: 'nonstopio.com',
  teams: [],
  reminders: { enabled: false },
  signatory: { name: 'Asha Example', role: 'Head of NonStop Academy' },
};

/** Claim keys set by the `setRoles` function. */
export interface RoleClaims {
  educator?: boolean;
  admin?: boolean;
}

/** Every signed-in person is a Learner; the other roles are granted. */
export function rolesFromClaims(claims: RoleClaims | undefined): Role[] {
  const roles: Role[] = ['learner'];
  if (claims?.educator === true) roles.push('educator');
  if (claims?.admin === true) roles.push('admin');
  return roles;
}

/** Only NonStop io accounts may sign in; compared lower-cased, as the rules do. */
export function isAllowedEmail(
  email: string | null | undefined,
  domain = 'nonstopio.com',
): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${domain}`);
}
