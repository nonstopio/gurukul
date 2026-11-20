import { log } from '../log';
import { bridgeFailure, type GurukulDesktop, type UpdateCheck } from './bridge';

/*
 * Whether the desktop app has a new version of itself downloaded and waiting
 * (`.plan/22-desktop-studio.md`, Updates). The shell downloads it in the background and says so
 * with `app.onUpdateReady`; the sidebar's "Update ready" item (`DesktopUpdateItem`) reads it here.
 *
 * One watch per bridge for the page's lifetime, not one per mounted sidebar: the sidebar is drawn
 * again on every move between the sidebar and focused layouts. The first watch also asks the shell
 * once (`app.checkForUpdate`), because the download may have finished before this page loaded.
 */

export interface UpdateWatch {
  /** The downloaded version waiting to install, or null. */
  get(): string | null;
  subscribe(listener: () => void): () => void;
  /** The install did not happen, or the item is spent: hide it until the next download. */
  clear(): void;
}

const watches = new WeakMap<GurukulDesktop, UpdateWatch>();

export function watchUpdates(desktop: GurukulDesktop): UpdateWatch {
  const known = watches.get(desktop);
  if (known) return known;
  let ready: string | null = null;
  const listeners = new Set<() => void>();
  const set = (version: string | null) => {
    ready = version;
    for (const listener of listeners) listener();
  };
  desktop.app.onUpdateReady(({ version }) => set(version));
  desktop.app.checkForUpdate().then(
    (result) => {
      if (result.state === 'ready') set(result.version);
    },
    (error: unknown) => log.warn('Desktop update check failed', { reason: bridgeFailure(error) }),
  );
  const watch: UpdateWatch = {
    get: () => ready,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear: () => set(null),
  };
  watches.set(desktop, watch);
  return watch;
}

/**
 * Whether leaving this page now would lose work: Studio's unsaved draft and the console's unsaved
 * forms ask to stay with `beforeunload`. The page asks its own listeners the same question, with a
 * cancelable event that leaves nothing. Asked before a restart into an update, which the shell
 * then does without asking the page again (`.plan/22-desktop-studio.md`, Updates).
 */
export function unsavedWork(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/** What a toast says after "Update the app" asked the shell for a new version. */
export function checkMessage(result: UpdateCheck): { tone: 'info' | 'warning'; text: string } {
  switch (result.state) {
    case 'up_to_date':
      return {
        tone: 'info',
        text: 'There is no newer Gurukul Studio yet. Try again later.',
      };
    case 'checking':
    case 'downloading':
      return {
        tone: 'info',
        text: 'Gurukul Studio is downloading its update. Update ready appears here when it is done.',
      };
    case 'ready':
      return { tone: 'info', text: 'Gurukul Studio is restarting to update.' };
    case 'unsupported':
      return {
        tone: 'warning',
        text: 'This copy of Gurukul Studio does not update itself. Download the newest from GitHub.',
      };
    case 'failed':
      return {
        tone: 'warning',
        text: 'Gurukul Studio could not check for updates. Check your connection and try again.',
      };
  }
}
