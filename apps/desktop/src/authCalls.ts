import { z } from 'zod';
import { notAvailable, type AreaHandlers } from './ipc';

/**
 * `auth.googleSignIn`: Google sign-in in the system browser (`DSK-09`). Refused as not available in
 * this version until then; the web app keeps its own sign-in.
 */
export function authCalls(): AreaHandlers<'auth'> {
  return {
    'auth.googleSignIn': notAvailable(z.tuple([])),
  };
}
