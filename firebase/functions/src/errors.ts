import { ApiException } from '@gurukul/schema';
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

/** The audit entry every console operation writes (`audit/{autoId}`, with a server timestamp). */
export interface AuditEntry {
  action: string;
  by: string;
  target?: string;
  detail: Record<string, unknown>;
}
