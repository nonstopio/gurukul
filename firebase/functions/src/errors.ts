import { ApiException, EDUCATOR_TEAM_NAME, teamId } from '@gurukul/schema';
import { isAllowedEmail } from './roles.js';
import type { RoleClaims } from './roles.js';

/** Who is calling: the uid, the verified email and the token's role claims. */
export interface Caller {
  uid: string;
  email?: string | undefined;
  /** The Google account's display name, when the token carries one. */
  name?: string | undefined;
  claims: RoleClaims | undefined;
}

/** Only an Admin on a NonStop account may run the console operations (`AUTH_2001`). */
export function requireAdmin(caller: Caller, action: string): void {
  if (!isAllowedEmail(caller.email) || caller.claims?.admin !== true) {
    throw new ApiException('AUTH_2001', [action]);
  }
}

/** A `teams/{id}` document as the functions read it; missing lists read as empty. */
export interface TeamRecord {
  id: string;
  name: string;
  memberEmails: string[];
  managerEmails: string[];
}

/** `teamId(EDUCATOR_TEAM_NAME)`: the one team only Admins manage. */
export const EDUCATOR_TEAM_ID = teamId(EDUCATOR_TEAM_NAME);

/** True for an Admin on a NonStop account (no throw). */
export const isAdmin = (caller: Caller): boolean =>
  isAllowedEmail(caller.email) && caller.claims?.admin === true;

/**
 * An Admin or a Manager on a NonStop account (`AUTH_2001` otherwise). Which teams a Manager may
 * touch is the operation's check (`managesTeam`); this one only opens the door.
 */
export function requireAdminOrManager(caller: Caller, action: string): void {
  if (
    !isAllowedEmail(caller.email) ||
    (caller.claims?.admin !== true && caller.claims?.manager !== true)
  ) {
    throw new ApiException('AUTH_2001', [action]);
  }
}

/**
 * Whether the caller may act for a team: an Admin for any team, a Manager for a team whose
 * `managerEmails` lists their email (compared lower-cased, as stored). `educator-candidates` opens
 * the Educator course, so it stays Admin-only whatever its managers say.
 */
export function managesTeam(
  caller: Caller,
  team: { id: string; managerEmails: readonly string[] },
): boolean {
  if (isAdmin(caller)) return true;
  if (!isAllowedEmail(caller.email) || caller.claims?.manager !== true) return false;
  if (team.id === EDUCATOR_TEAM_ID) return false;
  return team.managerEmails.includes((caller.email as string).toLowerCase());
}

/** The audit entry every console operation writes (`audit/{autoId}`, with a server timestamp). */
export interface AuditEntry {
  action: string;
  by: string;
  target?: string;
  detail: Record<string, unknown>;
}
