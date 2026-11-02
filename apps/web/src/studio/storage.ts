import type { FirebaseApp } from 'firebase/app';
import {
  connectStorageEmulator,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { UploadCancelledError } from './errors';
import { STORAGE_EMULATOR_HOST } from './emulator';
import type { MediaStorage } from './types';

/**
 * Cloud Storage for lesson uploads: the only importer of the Storage SDK. `main.tsx` imports this
 * module dynamically, so the SDK is a separate chunk that only an Educator who uploads downloads.
 * A resumable upload reports progress, stops on `signal` and resolves with the download URL.
 */
export function firebaseMediaStorage(app: FirebaseApp, emulators: boolean): MediaStorage {
  const storage = getStorage(app);
  if (emulators) {
    const [host, port] = STORAGE_EMULATOR_HOST.split(':') as [string, string];
    connectStorageEmulator(storage, host, Number(port));
  }
  return {
    upload({ path, file, metadata, onProgress, signal }) {
      return new Promise<string>((resolve, reject) => {
        const task = uploadBytesResumable(ref(storage, path), file, metadata);
        const stop = () => task.cancel();
        if (signal.aborted) stop();
        signal.addEventListener('abort', stop, { once: true });
        task.on(
          'state_changed',
          (snap) => onProgress((snap.bytesTransferred / Math.max(snap.totalBytes, 1)) * 100),
          (error) => {
            signal.removeEventListener('abort', stop);
            reject(error.code === 'storage/canceled' ? new UploadCancelledError() : error);
          },
          () => {
            signal.removeEventListener('abort', stop);
            getDownloadURL(task.snapshot.ref).then(resolve, reject);
          },
        );
      });
    },
  };
}
