/**
 * Where the window points, and which origins may use the bridge. The one place to change the
 * production host.
 *
 * A packaged build knows only production. A development build (`electron .` from this folder, so
 * `app.isPackaged` is false) loads the Vite dev server and also accepts production, so a developer
 * can open the live site in it. No environment variable widens the list: anything that could be set
 * on an Educator's machine would be a way to hand the bridge to another site.
 */

/** The deployed web app (`.plan/22-desktop-studio.md`, Architecture). */
export const PRODUCTION_URL = 'https://gurukul.nonstopio.com/studio';
/** `npm run dev -w @gurukul/web`. */
export const DEV_URL = 'http://localhost:5173/studio';

/** The page the window opens first. */
export function startUrl(dev: boolean): string {
  return dev ? DEV_URL : PRODUCTION_URL;
}

/** Origins whose top frame gets `window.gurukulDesktop` and may call the main process. */
export function allowedOrigins(dev: boolean): readonly string[] {
  const production = new URL(PRODUCTION_URL).origin;
  return dev ? [new URL(DEV_URL).origin, production] : [production];
}

/** The origin of a URL, or `null` when it is not one (`about:blank`, garbage). */
export function originOf(url: string): string | null {
  try {
    const origin = new URL(url).origin;
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

/** True when the URL is on one of the origins. */
export function isAllowedUrl(url: string, origins: readonly string[]): boolean {
  const origin = originOf(url);
  return origin !== null && origins.includes(origin);
}

/** The flag that carries the origins to the sandboxed preload, which cannot read files. */
export const ORIGINS_FLAG = '--gurukul-origins=';

export function originsArgument(origins: readonly string[]): string {
  return ORIGINS_FLAG + origins.join(',');
}
