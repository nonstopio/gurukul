import { diffGrants, planRoleChange, rolesFromClaims } from './roles.js';
import type { RoleChange, RoleClaims, RolePlan } from './roles.js';
import { log } from './logging/log.js';

/** The Admin SDK calls `setRoles` needs, so the decision logic can be tested without Firebase. */
export interface RoleAdmin {
  getClaims(uid: string): Promise<RoleClaims | undefined>;
  setClaims(uid: string, claims: RoleClaims): Promise<void>;
  revokeTokens(uid: string): Promise<void>;
  mirrorRoles(uid: string, plan: RolePlan): Promise<void>;
  /** `users/{uid}.grantedCourseIds`, or an empty list when there is none. */
  getGrantedCourseIds(uid: string): Promise<string[]>;
  /**
   * Stores the new list on the profile and, in one batch, adds the uid to `acharyaIds` of each
   * added course and removes it from each removed one. Course documents that do not exist are
   * skipped, never created.
   */
  applyCourseGrants(
    uid: string,
    grantedCourseIds: string[],
    change: { added: string[]; removed: string[] },
  ): Promise<void>;
  audit(entry: {
    action: string;
    by: string;
    target: string;
    detail: RolePlan['claims'] & { grantedCourseIds?: string[] };
  }): Promise<void>;
}

/**
 * Grants or revokes roles: sets the claims, mirrors `roles` on the profile, revokes the person's
 * refresh tokens so the new claims apply on their next token refresh, and writes the audit entry.
 */
export async function applyRoleChange(
  admin: RoleAdmin,
  caller: { uid: string; email?: string | undefined; claims: RoleClaims | undefined },
  targetUid: string,
  change: RoleChange,
): Promise<RolePlan> {
  log.debug('Applying a role change', { uid: targetUid, by: caller.uid });
  const plan = planRoleChange(caller, targetUid, await admin.getClaims(targetUid), change);
  await admin.setClaims(targetUid, plan.claims);
  await admin.mirrorRoles(targetUid, plan);
  if (plan.grantedCourseIds !== undefined) {
    const previous = await admin.getGrantedCourseIds(targetUid);
    await admin.applyCourseGrants(
      targetUid,
      plan.grantedCourseIds,
      diffGrants(previous, plan.grantedCourseIds),
    );
  }
  await admin.revokeTokens(targetUid);
  await admin.audit({
    action: 'roles.set',
    by: caller.uid,
    target: targetUid,
    detail: {
      ...plan.claims,
      ...(plan.grantedCourseIds === undefined ? {} : { grantedCourseIds: plan.grantedCourseIds }),
    },
  });
  log.info('Roles changed', { uid: targetUid, by: caller.uid, count: plan.roles.length });
  return plan;
}

/**
 * The one-off bootstrap behind `npm run grant-kulapati -- you@nonstopio.com`: makes the first
 * Kulapati. Run once with an admin credential on the maintainer's machine, never in CI.
 */
export async function grantKulapati(
  deps: {
    uidForEmail(email: string): Promise<string>;
    admin: RoleAdmin;
  },
  email: string | undefined,
): Promise<string> {
  const target = email?.trim().toLowerCase();
  if (!target?.endsWith('@nonstopio.com')) {
    throw new Error('Usage: npm run grant-kulapati -- you@nonstopio.com');
  }
  const uid = await deps.uidForEmail(target);
  const current = await deps.admin.getClaims(uid);
  const claims = { acharya: current?.acharya === true, kulapati: true };
  const plan: RolePlan = { claims, roles: rolesFromClaims(claims) };
  await deps.admin.setClaims(uid, plan.claims);
  await deps.admin.mirrorRoles(uid, plan);
  await deps.admin.revokeTokens(uid);
  await deps.admin.audit({
    action: 'roles.bootstrap',
    by: 'script',
    target: uid,
    detail: plan.claims,
  });
  return uid;
}
