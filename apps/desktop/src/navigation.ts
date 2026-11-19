import { isAllowedUrl } from './config';
import type { Logger } from './log';

/**
 * The window stays on Gurukul. A link to anywhere else opens in the system browser; a new window is
 * never created; a redirect away from Gurukul is stopped; `<webview>` is refused. Applied to every
 * web contents the app creates (`app.on('web-contents-created')`), so nothing slips past by being
 * created later.
 */

/** Schemes the system browser or mail app may be asked to open. Never `file:` or a custom scheme. */
const EXTERNAL = new Set(['http:', 'https:', 'mailto:']);

export function isExternalUrl(url: string): boolean {
  try {
    return EXTERNAL.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** What happens to a top-level navigation of the window. */
export function decideNavigation(
  url: string,
  origins: readonly string[],
): 'stay' | 'external' | 'block' {
  if (isAllowedUrl(url, origins)) return 'stay';
  return isExternalUrl(url) ? 'external' : 'block';
}

export interface ShellLike {
  openExternal(url: string): Promise<void>;
}

interface PreventableEvent {
  preventDefault(): void;
}

interface NavigationEvent extends PreventableEvent {
  readonly url: string;
}

/** The parts of Electron's `WebContents` the guard uses. */
export interface ContentsLike {
  on(event: 'will-navigate' | 'will-redirect', listener: (event: NavigationEvent) => void): unknown;
  on(event: 'will-attach-webview', listener: (event: PreventableEvent) => void): unknown;
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void;
}

export function guardContents(
  contents: ContentsLike,
  origins: readonly string[],
  shell: ShellLike,
  log: Logger,
): void {
  const openOutside = (url: string) => {
    if (!isExternalUrl(url)) {
      log.warn('Link not opened', { reason: 'scheme' });
      return;
    }
    shell.openExternal(url).catch((error: unknown) => log.error('Link not opened', error));
  };

  contents.on('will-navigate', (event) => {
    const decision = decideNavigation(event.url, origins);
    if (decision === 'stay') return;
    event.preventDefault();
    if (decision === 'external') openOutside(event.url);
    else log.warn('Navigation blocked', { reason: 'scheme' });
  });

  contents.on('will-redirect', (event) => {
    if (decideNavigation(event.url, origins) === 'stay') return;
    event.preventDefault();
    log.warn('Navigation blocked', { reason: 'redirect' });
  });

  // `target="_blank"` and `window.open`, even to Gurukul itself: the window is the only window.
  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });

  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
    log.warn('Navigation blocked', { reason: 'webview' });
  });
}

/** Permissions the page may have: copying to the clipboard, and full screen for a lesson's video. */
export function allowPermission(
  permission: string,
  requestingUrl: string,
  origins: readonly string[],
): boolean {
  if (permission === 'fullscreen') return true;
  return permission === 'clipboard-sanitized-write' && isAllowedUrl(requestingUrl, origins);
}
