import { beforeEach, describe, expect, it, vi } from 'vitest';

type Next = (snap: { bytesTransferred: number; totalBytes: number }) => void;
const sdk = vi.hoisted(() => {
  const task = {
    cancel: vi.fn(),
    snapshot: { ref: { name: 'ref' } },
    on: vi.fn(),
  };
  return {
    task,
    getStorage: vi.fn(() => ({ kind: 'storage' })),
    connectStorageEmulator: vi.fn(),
    ref: vi.fn((_s: unknown, path: string) => ({ path })),
    uploadBytesResumable: vi.fn(() => task),
    getDownloadURL: vi.fn(),
  };
});
vi.mock('firebase/storage', () => sdk);

import { UploadCancelledError } from '../src/studio/errors';
import { firebaseMediaStorage } from '../src/studio/storage';

const app = { name: 'app' } as never;
const metadata = {
  contentType: 'image/png',
  cacheControl: 'public, max-age=31536000, immutable',
  customMetadata: { courseId: 'c1' },
};
const file = new Blob(['x']);

/** Starts an upload and returns the callbacks the SDK was given. */
function start(signal = new AbortController().signal, onProgress = vi.fn()) {
  const storage = firebaseMediaStorage(app, false);
  const done = storage.upload({
    path: 'courses/c1/media/m1.png',
    file,
    metadata,
    onProgress,
    signal,
  });
  const [, next, fail, complete] = sdk.task.on.mock.calls.at(-1) as [
    string,
    Next,
    (e: { code: string }) => void,
    () => void,
  ];
  return { done, next, fail, complete, onProgress };
}

beforeEach(() => vi.clearAllMocks());

describe('firebaseMediaStorage', () => {
  it('uploads to the path with the metadata, reporting percent, and resolves with the URL', async () => {
    sdk.getDownloadURL.mockResolvedValue('https://example.com/file');
    const { done, next, complete, onProgress } = start();
    expect(sdk.ref).toHaveBeenCalledWith({ kind: 'storage' }, 'courses/c1/media/m1.png');
    expect(sdk.uploadBytesResumable).toHaveBeenCalledWith(
      { path: 'courses/c1/media/m1.png' },
      file,
      metadata,
    );
    next({ bytesTransferred: 25, totalBytes: 100 });
    next({ bytesTransferred: 0, totalBytes: 0 });
    expect(onProgress.mock.calls).toEqual([[25], [0]]);
    complete();
    await expect(done).resolves.toBe('https://example.com/file');
    expect(sdk.getDownloadURL).toHaveBeenCalledWith(sdk.task.snapshot.ref);
  });

  it('rejects when the download URL cannot be read', async () => {
    sdk.getDownloadURL.mockRejectedValue(new Error('no url'));
    const { done, complete } = start();
    complete();
    await expect(done).rejects.toThrow('no url');
  });

  it('rejects with the SDK error, so the caller can read its code', async () => {
    const { done, fail } = start();
    const error = { code: 'storage/unauthorized' };
    fail(error);
    await expect(done).rejects.toBe(error);
  });

  it('cancels the task when the signal aborts, and says it was cancelled', async () => {
    const controller = new AbortController();
    const { done, fail } = start(controller.signal);
    controller.abort();
    expect(sdk.task.cancel).toHaveBeenCalledOnce();
    fail({ code: 'storage/canceled' });
    await expect(done).rejects.toBeInstanceOf(UploadCancelledError);
  });

  it('cancels at once when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { done, fail } = start(controller.signal);
    expect(sdk.task.cancel).toHaveBeenCalledOnce();
    fail({ code: 'storage/canceled' });
    await expect(done).rejects.toBeInstanceOf(UploadCancelledError);
  });

  it('stops listening for an abort once the upload has finished', async () => {
    sdk.getDownloadURL.mockResolvedValue('u');
    const controller = new AbortController();
    const { done, complete } = start(controller.signal);
    complete();
    await done;
    controller.abort();
    expect(sdk.task.cancel).not.toHaveBeenCalled();
  });

  it('connects the Storage emulator only when asked', () => {
    firebaseMediaStorage(app, false);
    expect(sdk.connectStorageEmulator).not.toHaveBeenCalled();
    firebaseMediaStorage(app, true);
    expect(sdk.connectStorageEmulator).toHaveBeenCalledWith({ kind: 'storage' }, '127.0.0.1', 9199);
  });
});
