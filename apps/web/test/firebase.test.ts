import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
vi.mock('firebase/app', () => ({ initializeApp: vi.fn((c) => ({ config: c })) }));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ kind: 'auth' })),
  connectAuthEmulator: vi.fn(() => calls.push('auth-emulator')),
}));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({ kind: 'functions' })),
  connectFunctionsEmulator: vi.fn(() => calls.push('functions-emulator')),
}));
vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn((_app, settings) => ({ kind: 'db', settings })),
  persistentLocalCache: vi.fn((s) => ({ cache: 'persistent', ...s })),
  persistentMultipleTabManager: vi.fn(() => ({ tabs: 'multiple' })),
  connectFirestoreEmulator: vi.fn(() => calls.push('db-emulator')),
}));

import { firebaseConfig, initFirebase } from '../src/firebase';

beforeEach(() => {
  calls.length = 0;
});

describe('firebaseConfig', () => {
  it('reads the public config from the environment', () => {
    expect(
      firebaseConfig({
        VITE_FIREBASE_API_KEY: 'k',
        VITE_FIREBASE_AUTH_DOMAIN: 'd',
        VITE_FIREBASE_PROJECT_ID: 'p',
        VITE_FIREBASE_APP_ID: 'a',
      }),
    ).toEqual({ apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' });
  });

  it('is empty rather than throwing when nothing is set', () => {
    expect(firebaseConfig({})).toEqual({ apiKey: '', authDomain: '', projectId: '', appId: '' });
  });

  it('uses the demo project with the emulators, whatever the project id says', () => {
    expect(
      firebaseConfig({ VITE_USE_EMULATORS: 'true', VITE_FIREBASE_PROJECT_ID: 'nonstop-gurukul' }),
    ).toMatchObject({ projectId: 'demo-gurukul', apiKey: 'demo-key' });
  });
});

describe('initFirebase', () => {
  it('connects to production only', () => {
    const fb = initFirebase({ VITE_FIREBASE_PROJECT_ID: 'p' });
    expect(fb.auth).toEqual({ kind: 'auth' });
    expect(calls).toEqual([]);
  });

  it('keeps a persistent Firestore cache shared across tabs, so reading works offline', () => {
    const fb = initFirebase({ VITE_FIREBASE_PROJECT_ID: 'p' });
    expect(fb.db).toEqual({
      kind: 'db',
      settings: { localCache: { cache: 'persistent', tabManager: { tabs: 'multiple' } } },
    });
  });

  it('connects the Auth and Firestore emulators when asked', () => {
    initFirebase({ VITE_USE_EMULATORS: 'true' });
    expect(calls).toEqual(['auth-emulator', 'db-emulator', 'functions-emulator']);
  });
});
