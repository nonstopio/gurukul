import { ApiException } from '@gurukul/schema';
import { isAllowedEmail } from './roles.js';
import type { RoleClaims } from './roles.js';

/** Who is calling: the uid, the verified email and the token's role claims. */
export interface Caller {
  uid: string;
  email?: string | undefined;
  claims: RoleClaims | undefined;
}

/** Only a Kulapati on a NonStop account may run the console operations (`AUTH_2001`). */
export function requireKulapati(caller: Caller, action: string): void {
  if (!isAllowedEmail(caller.email) || caller.claims?.kulapati !== true) {
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
