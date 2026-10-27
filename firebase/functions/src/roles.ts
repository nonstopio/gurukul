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
}

export interface RolePlan {
  claims: Required<RoleClaims>;
  roles: Role[];
}

export class RoleError extends Error {
  constructor(
    readonly code: 'permission-denied' | 'invalid-argument' | 'failed-precondition',
    message: string,
  ) {
    super(message);
  }
}

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
    throw new RoleError('permission-denied', 'Only a Kulapati can change roles.');
  }
  if (
    (change.acharya !== undefined && typeof change.acharya !== 'boolean') ||
    (change.kulapati !== undefined && typeof change.kulapati !== 'boolean') ||
    (change.acharya === undefined && change.kulapati === undefined)
  ) {
    throw new RoleError('invalid-argument', 'Give acharya and/or kulapati as true or false.');
  }
  if (caller.uid === targetUid && change.kulapati === false) {
    throw new RoleError('failed-precondition', 'You cannot remove your own Kulapati role.');
  }
  const claims = {
    acharya: change.acharya ?? current?.acharya === true,
    kulapati: change.kulapati ?? current?.kulapati === true,
  };
  return { claims, roles: rolesFromClaims(claims) };
}
