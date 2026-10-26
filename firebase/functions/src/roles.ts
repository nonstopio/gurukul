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
