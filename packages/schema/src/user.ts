import { z } from 'zod';
import { timestamp } from './timestamp';

export const roleSchema = z.enum(['shishya', 'acharya', 'kulapati']);
export type Role = z.infer<typeof roleSchema>;

export const userSchema = z.object({
  email: z.email(),
  displayName: z.string().max(120),
  photoURL: z.string().nullable(),
  team: z.string().max(80).nullable(),
  roles: z.array(roleSchema).min(1),
  grantedCourseIds: z.array(z.string()),
  createdAt: timestamp,
});
export type UserProfile = z.infer<typeof userSchema>;

/** `config/org`: the allowed domain, the teams a learner can pick, and reminder settings. */
export const orgConfigSchema = z.object({
  domain: z.string().min(1),
  teams: z.array(z.string().min(1).max(80)).max(100),
  reminders: z.object({ enabled: z.boolean() }),
});
export type OrgConfig = z.infer<typeof orgConfigSchema>;

export const DEFAULT_ORG_CONFIG: OrgConfig = {
  domain: 'nonstopio.com',
  teams: [],
  reminders: { enabled: false },
};

/** Claim keys set by the `setRoles` function. */
export interface RoleClaims {
  acharya?: boolean;
  kulapati?: boolean;
}

/** Every signed-in person is a Shishya; the other roles are granted. */
export function rolesFromClaims(claims: RoleClaims | undefined): Role[] {
  const roles: Role[] = ['shishya'];
  if (claims?.acharya === true) roles.push('acharya');
  if (claims?.kulapati === true) roles.push('kulapati');
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
