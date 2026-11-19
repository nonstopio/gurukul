import { DownloadIcon, NavAction, SidebarGroup, useToast } from '@gurukul/ui';
import { useState, useSyncExternalStore } from 'react';
import { toastError } from '../errors';
import { log } from '../log';
import { useDesktop, type GurukulDesktop } from './bridge';
import { checkMessage, watchUpdates } from './updates';

/*
 * The sidebar's update item, inside the desktop app only (`.plan/22-desktop-studio.md`, Updates).
 * In a browser it draws nothing and asks nothing.
 *
 * - "Update ready": the shell has downloaded a new version of itself. A click restarts into it; a
 *   normal Quit installs it too. If the install does not happen the app stays open and the item
 *   goes until the next download.
 * - "Update the app": this site needs a newer bridge than the installed shell has. A click asks
 *   the shell for its update and installs it once it is there.
 */

const GROUP = 'Gurukul Studio';

/** Restarts into the downloaded shell. Resolves only when that did not happen. */
async function install(desktop: GurukulDesktop, toast: ReturnType<typeof useToast>) {
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
}

function UpdateReady({ desktop }: { desktop: GurukulDesktop }) {
  const watch = watchUpdates(desktop);
  const version = useSyncExternalStore(watch.subscribe, watch.get);
  const [installing, setInstalling] = useState(false);
  const toast = useToast();
  if (version === null) return null;
  const onClick = async () => {
    setInstalling(true);
    await install(desktop, toast);
    watch.clear();
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
  const toast = useToast();
  const onClick = async () => {
    setChecking(true);
    try {
      const result = await desktop.app.checkForUpdate();
      const { tone, text } = checkMessage(result);
      toast.show(text, { tone });
      if (result.state === 'ready') await install(desktop, toast);
    } catch (error) {
      log.error('Desktop update check failed', error);
      toastError(toast, error, 'Gurukul Studio could not check for updates.');
    }
    setChecking(false);
  };
  return (
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
}

export function DesktopUpdateItem() {
  const state = useDesktop();
  if (state.status === 'ready') return <UpdateReady desktop={state.desktop} />;
  if (state.status === 'needs_update') return <UpdateTheApp desktop={state.desktop} />;
  return null;
}
