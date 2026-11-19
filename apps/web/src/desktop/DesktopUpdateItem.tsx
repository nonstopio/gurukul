import { DownloadIcon, NavAction, SidebarGroup, useToast } from '@gurukul/ui';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { toastError } from '../errors';
import { log } from '../log';
import { useDesktop, type GurukulDesktop } from './bridge';
import { checkMessage, unsavedWork, watchUpdates } from './updates';

/*
 * The sidebar's update item, inside the desktop app only (`.plan/22-desktop-studio.md`, Updates).
 * In a browser it draws nothing and asks nothing.
 *
 * - "Update ready": the shell has downloaded a new version of itself. A click restarts into it; a
 *   normal Quit installs it too. A page holding unsaved work is not left: the item asks for it to
 *   be saved first. If the install does not happen the app stays open and the item goes until the
 *   next download.
 * - "Update the app": this site needs a newer bridge than the installed shell has. A click asks
 *   the shell for its update; once it has downloaded, the item becomes Update ready.
 */

const GROUP = 'Gurukul Studio';

/**
 * Restarts into the downloaded shell, calling `restarting` first. Resolves only when that did not
 * happen; true when the update is still waiting (the page held unsaved work, so nothing was asked
 * of the shell).
 */
async function install(
  desktop: GurukulDesktop,
  toast: ReturnType<typeof useToast>,
  restarting: () => void = () => undefined,
): Promise<boolean> {
  if (unsavedWork()) {
    toast.show('Save or leave this page, then choose Update ready again.', {
      tone: 'warning',
      title: 'Save your work first',
    });
    return true;
  }
  restarting();
  try {
    await desktop.app.installUpdate();
    log.warn('Desktop update not installed', {});
    toast.show('Gurukul Studio tries again at its next check for updates.', {
      tone: 'warning',
      title: 'The update was not installed',
    });
  } catch (error) {
    log.error('Desktop update install failed', error);
    toastError(toast, error, 'Gurukul Studio could not install the update.');
  }
  return false;
}

/** Update ready once a download is waiting; `fallback` until then. */
function UpdateReady({
  desktop,
  fallback = null,
}: {
  desktop: GurukulDesktop;
  fallback?: ReactNode;
}) {
  const watch = watchUpdates(desktop);
  const version = useSyncExternalStore(watch.subscribe, watch.get);
  const [installing, setInstalling] = useState(false);
  const toast = useToast();
  if (version === null) return fallback;
  const onClick = async () => {
    setInstalling(true);
    if (!(await install(desktop, toast))) watch.clear();
    setInstalling(false);
  };
  return (
    <SidebarGroup label={GROUP}>
      <NavAction
        icon={<DownloadIcon />}
        detail={`Restart to install ${version}`}
        loading={installing}
        onClick={() => void onClick()}
      >
        Update ready
      </NavAction>
    </SidebarGroup>
  );
}

function UpdateTheApp({ desktop }: { desktop: GurukulDesktop }) {
  const [checking, setChecking] = useState(false);
  // Set once a check found an update: from then on the item waits for it (`app.onUpdateReady`).
  const [waiting, setWaiting] = useState(false);
  const toast = useToast();
  const onClick = async () => {
    setChecking(true);
    try {
      const result = await desktop.app.checkForUpdate();
      const { tone, text } = checkMessage(result);
      // A ready update says "restarting" only when it does restart; `install` says why not.
      if (result.state === 'ready') await install(desktop, toast, () => toast.show(text, { tone }));
      else toast.show(text, { tone });
      // From here the watch shows Update ready while a download waits, and this item otherwise.
      if (['checking', 'downloading', 'ready'].includes(result.state)) setWaiting(true);
    } catch (error) {
      log.error('Desktop update check failed', error);
      toastError(toast, error, 'Gurukul Studio could not check for updates.');
    }
    setChecking(false);
  };
  const item = (
    <SidebarGroup label={GROUP}>
      <NavAction
        icon={<DownloadIcon />}
        detail="This page needs a newer version"
        loading={checking}
        onClick={() => void onClick()}
      >
        Update the app
      </NavAction>
    </SidebarGroup>
  );
  return waiting ? <UpdateReady desktop={desktop} fallback={item} /> : item;
}

export function DesktopUpdateItem() {
  const state = useDesktop();
  if (state.status === 'ready') return <UpdateReady desktop={state.desktop} />;
  if (state.status === 'needs_update') return <UpdateTheApp desktop={state.desktop} />;
  return null;
}
