/**
 * The Google "Desktop" OAuth client the shell signs in with (`.plan/22-desktop-studio.md`, Signing
 * in to Gurukul; open question 22). Its id and secret are build-time configuration: the bundle
 * script (`scripts/bundle.ts`) replaces the two `process.env` reads in `main.ts` with the values it
 * was built with, from GitHub Actions secrets in a release build and from the environment or
 * `apps/desktop/.env` in development. They are never committed. Google does not treat a Desktop
 * client's secret as confidential (anyone can read it out of an installer), but this repository is
 * public, so it stays out of git all the same.
 */

/** The variables the bundle script reads. */
export const CLIENT_ID_VAR = 'GURUKUL_DESKTOP_GOOGLE_CLIENT_ID';
export const CLIENT_SECRET_VAR = 'GURUKUL_DESKTOP_GOOGLE_CLIENT_SECRET';

export interface GoogleClient {
  id: string;
  /** Google's token endpoint asks a Desktop client for it; null when the build has none. */
  secret: string | null;
}

/** The client a build was given, or null when it has no id (sign-in then says so). */
export function googleClient(
  id: string | undefined,
  secret: string | undefined,
): GoogleClient | null {
  const cleanId = id?.trim() ?? '';
  if (cleanId === '') return null;
  const cleanSecret = secret?.trim() ?? '';
  return { id: cleanId, secret: cleanSecret === '' ? null : cleanSecret };
}

/**
 * esbuild's `define` for the main bundle: each variable becomes a string literal, empty when unset,
 * so the packaged app never reads it from the Educator's environment.
 */
export function clientDefines(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    [CLIENT_ID_VAR, CLIENT_SECRET_VAR].map((name) => [
      `process.env.${name}`,
      JSON.stringify(env[name] ?? ''),
    ]),
  );
}
