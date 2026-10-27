import { ApiException } from '@gurukul/schema';
import { invalid, missing } from './validation.js';

/**
 * Gurukul roles. Stored as Firebase Auth custom claims and mirrored on
 * users/{uid}.roles. Security rules read the claims; the UI reads the mirror.
 * See .plan/03-auth-and-roles.md.
 */
export type Role = 'shishya' | 'acharya' | 'kulapati';

/** Claim keys set by the role-grant function. */
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

/** Only NonStop io Google Workspace accounts may sign in. */
export function isAllowedEmail(email: string | undefined, domain = 'nonstopio.com'): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${domain}`);
}

/** What a Kulapati asks `setRoles` to change on one person. Omitted keys stay as they are. */
export interface RoleChange {
  acharya?: boolean;
  kulapati?: boolean;
  /** The courses this person may edit as an Acharya; replaces the previous list. At most 50. */
  grantedCourseIds?: string[];
}

export interface RolePlan {
  claims: Required<RoleClaims>;
  roles: Role[];
  /** Present when the change sets the course grants (de-duplicated). */
  grantedCourseIds?: string[];
}

export const MAX_GRANTED_COURSES = 50;

const isCourseIdList = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length <= MAX_GRANTED_COURSES &&
  v.every((id) => typeof id === 'string' && id !== '' && !id.includes('/'));

/**
 * Decides a role change. Only a Kulapati on a NonStop account may grant or revoke, and a Kulapati
 * cannot remove their own Kulapati role, so the platform can never lock itself out. Returns the
 * complete claims to write and the `roles` mirror for `users/{uid}`.
 */
export function planRoleChange(
  caller: { uid: string; email?: string | undefined; claims: RoleClaims | undefined },
  targetUid: string,
  current: RoleClaims | undefined,
  change: RoleChange,
): RolePlan {
  if (!isAllowedEmail(caller.email) || caller.claims?.kulapati !== true) {
    throw new ApiException('AUTH_2001', ['setRoles']);
  }
  for (const field of ['acharya', 'kulapati'] as const) {
    if (change[field] !== undefined && typeof change[field] !== 'boolean') {
      throw invalid(field, 'must be true or false');
    }
  }
  if (change.grantedCourseIds !== undefined && !isCourseIdList(change.grantedCourseIds)) {
    throw invalid('grantedCourseIds', `must be at most ${MAX_GRANTED_COURSES} course ids`);
  }
  if (
    change.acharya === undefined &&
    change.kulapati === undefined &&
    change.grantedCourseIds === undefined
  ) {
    throw missing('acharya, kulapati or grantedCourseIds');
  }
  if (caller.uid === targetUid && change.kulapati === false) throw new ApiException('USR_1001');
  const claims = {
    acharya: change.acharya ?? current?.acharya === true,
    kulapati: change.kulapati ?? current?.kulapati === true,
  };
  return {
    claims,
    roles: rolesFromClaims(claims),
    ...(change.grantedCourseIds === undefined
      ? {}
      : { grantedCourseIds: [...new Set(change.grantedCourseIds)] }),
  };
}

/** Which course grants are new and which were taken away. */
export function diffGrants(
  previous: readonly string[],
  next: readonly string[],
): { added: string[]; removed: string[] } {
  return {
    added: next.filter((id) => !previous.includes(id)),
    removed: previous.filter((id) => !next.includes(id)),
  };
}
