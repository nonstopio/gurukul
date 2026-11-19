import { z } from 'zod';
import type { GoogleSignInResult } from './bridge';
import type { AreaHandlers } from './ipc';

/**
 * `auth.googleSignIn`: Google sign-in in the system browser (`googleSignIn.ts`). It takes no
 * arguments and answers an ID token or why there is none; the window signs in to Firebase with it.
 */
export function authCalls(googleSignIn: () => Promise<GoogleSignInResult>): AreaHandlers<'auth'> {
  return {
    'auth.googleSignIn': { args: z.tuple([]), run: () => googleSignIn() },
  };
}
