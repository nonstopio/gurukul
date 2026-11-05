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
   * Stores the new list on the profile and, in one batch, adds the uid to `educatorIds` (and the
   * profile's display name to `educatorNames`) of every granted course, and removes both from each
   * removed one. Course documents that do not exist are skipped, never created.
   */
  applyCourseGrants(
    uid: string,
    grantedCourseIds: string[],
    change: { added: string[]; removed: string[] },
  ): Promise<void>;
  /**
   * Handover: removes this person's email (lower-cased, from their Auth account) from every team's
   * `managerEmails`. Returns how many teams changed; 0 when they manage none or have no email.
   */
  releaseManagedTeams(uid: string): Promise<number>;
  audit(entry: {
    action: string;
    by: string;
    target: string;
    detail: RolePlan['claims'] & { grantedCourseIds?: string[]; teamsReleased?: number };
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
  // Taking the role away hands the person's teams back to Admins at once, in the same call. Run
  // on every "manager: false", not only a change, so a handover a failed call left half done is
  // finished by saving again.
  const released = change.manager === false ? await admin.releaseManagedTeams(targetUid) : 0;
  await admin.revokeTokens(targetUid);
  await admin.audit({
    action: 'roles.set',
    by: caller.uid,
    target: targetUid,
    detail: {
      ...plan.claims,
      ...(plan.grantedCourseIds === undefined ? {} : { grantedCourseIds: plan.grantedCourseIds }),
      ...(released > 0 ? { teamsReleased: released } : {}),
    },
  });
  log.info('Roles changed', {
    uid: targetUid,
    by: caller.uid,
    count: plan.roles.length,
    teamsReleased: released,
  });
  return plan;
}

/**
 * Makes someone an Educator because they finished the Educator course. False when they already
 * are. Tokens are not revoked: that would sign the learner out on their completion screen, and an
 * added role needs no revocation (the app refreshes its token when the `roles` mirror changes).
 */
export async function grantEducatorByCourse(admin: RoleAdmin, uid: string): Promise<boolean> {
  const current = await admin.getClaims(uid);
  if (current?.educator === true) return false;
  // Every other claim stays as it is: this call adds a role, it never takes one away.
  const claims = {
    educator: true,
    manager: current?.manager === true,
    admin: current?.admin === true,
  };
  const plan: RolePlan = { claims, roles: rolesFromClaims(claims) };
  await admin.setClaims(uid, plan.claims);
  await admin.mirrorRoles(uid, plan);
  await admin.audit({ action: 'roles.course', by: 'system', target: uid, detail: plan.claims });
  return true;
}

/**
 * The one-off bootstrap behind `npm run grant-admin -- you@nonstopio.com`: makes the first
 * Admin. Run once with an admin credential on the maintainer's machine, never in CI.
 */
export async function grantAdmin(
  deps: {
    uidForEmail(email: string): Promise<string>;
    admin: RoleAdmin;
  },
  email: string | undefined,
): Promise<string> {
  const target = email?.trim().toLowerCase();
  if (!target?.endsWith('@nonstopio.com')) {
    throw new Error('Usage: npm run grant-admin -- you@nonstopio.com');
  }
  const uid = await deps.uidForEmail(target);
  const current = await deps.admin.getClaims(uid);
  const claims = {
    educator: current?.educator === true,
    manager: current?.manager === true,
    admin: true,
  };
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
