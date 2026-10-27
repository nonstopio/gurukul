import { RoleError } from './roles.js';
import type { RoleChange, RoleClaims } from './roles.js';
import { applyRoleChange } from './set-roles.js';
import type { RoleAdmin } from './set-roles.js';

/** The slice of a callable request `setRoles` reads. */
export interface CallableRequest {
  auth?: { uid: string; token: RoleClaims & { email?: string } } | undefined;
  data?: ({ uid?: unknown } & RoleChange) | undefined;
}

/** A failure the wrapper turns into an `HttpsError` with the same code. */
export class CallError extends Error {
  constructor(
    readonly code: 'unauthenticated' | 'invalid-argument' | RoleError['code'],
    message: string,
  ) {
    super(message);
  }
}

/** The `setRoles` callable's body: validate the request, then apply the change. */
export async function handleSetRoles(
  request: CallableRequest,
  admin: RoleAdmin,
): Promise<{ roles: string[] }> {
  if (!request.auth) throw new CallError('unauthenticated', 'Sign in first.');
  const { uid, ...change } = request.data ?? {};
  if (typeof uid !== 'string' || uid === '') {
    throw new CallError('invalid-argument', 'uid is required.');
  }
  const { token } = request.auth;
  try {
    const plan = await applyRoleChange(
      admin,
      { uid: request.auth.uid, email: token.email, claims: token },
      uid,
      change,
    );
    return { roles: plan.roles };
  } catch (e) {
    if (e instanceof RoleError) throw new CallError(e.code, e.message);
    throw e;
  }
}
