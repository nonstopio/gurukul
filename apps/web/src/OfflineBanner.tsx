import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Whether the browser believes it has a connection, kept current by the online/offline events. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine);
}

/** The shared offline state: a thin banner under the top bar while the connection is gone. */
export function OfflineBanner() {
  if (useOnline()) return null;
  return (
    <p className="app__offline" role="status">
      You're offline. Progress will sync when you're back.
    </p>
  );
}
