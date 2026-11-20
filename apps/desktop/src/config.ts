/**
 * Where the window points, and which origins may use the bridge. The one place to change the
 * production host.
 *
 * A packaged build knows only production. A development build (`electron .` from this folder, so
 * `app.isPackaged` is false) loads the Vite dev server and also accepts production, so a developer
 * can open the live site in it. The end-to-end tests (`DSK-24`) point a development build at the
 * app they serve with `GURUKUL_DESKTOP_TEST_URL`; a packaged build never reads it, and even a
 * development build takes only a plain `http` page on this computer (`127.0.0.1` or `localhost`,
 * with a port). Anything that could be set on an Educator's machine would be a way to hand the
 * bridge to another site, so nothing else in the environment widens the list.
 */

/** The deployed web app (`.plan/22-desktop-studio.md`, Architecture). */
export const PRODUCTION_URL = 'https://gurukul.nonstopio.com/studio';
/** `npm run dev -w @gurukul/web`. */
export const DEV_URL = 'http://localhost:5173/studio';

/** The environment variable the end-to-end tests set to open their own local app. */
export const TEST_URL_VARIABLE = 'GURUKUL_DESKTOP_TEST_URL';

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost'];

/**
 * The page a test run asked a development build to open, or null: always null in a packaged build,
 * and for anything but `http://127.0.0.1:<port>/…` or `http://localhost:<port>/…` (no user name,
 * password or other host).
 */
export function testUrl(dev: boolean, value: string | undefined): string | null {
  if (!dev || value === undefined || value === '') return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const loopback =
    url.protocol === 'http:' &&
    LOOPBACK_HOSTS.includes(url.hostname) &&
    url.port !== '' &&
    url.username === '' &&
    url.password === '';
  return loopback ? url.href : null;
}

/** The page the window opens first: a test run's page (`testUrl`), the dev server or production. */
export function startUrl(dev: boolean, test: string | null = null): string {
  if (!dev) return PRODUCTION_URL;
  return test ?? DEV_URL;
}

/** Origins whose top frame gets `window.gurukulDesktop` and may call the main process. */
export function allowedOrigins(dev: boolean, test: string | null = null): readonly string[] {
  const production = new URL(PRODUCTION_URL).origin;
  if (!dev) return [production];
  const origins = [new URL(DEV_URL).origin, production];
  return test === null ? origins : [new URL(test).origin, ...origins];
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
