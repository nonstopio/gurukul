/**
 * The required-update number. The build writes it into `/version.json` beside the build id, and an
 * open tab built with a lower number than the live one stops and asks to update (`boot.ts`).
 *
 * Bump it in the pull request whose release every open tab must take: a fix for a bug that harms
 * data (a write loop, a wrong grade), or a change the old code would break against. Any other
 * release only offers the update, and the person picks when.
 */
export const REQUIRED_UPDATE = 0;
