import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
// Pariksha drafts live in localStorage; each test starts without one. One hook, in this order:
// Vitest runs separate afterEach hooks last-first, and unmounting runs any effect still pending,
// which can save the test's draft again after an earlier clear.
// Some files run in the node environment, which has no localStorage.
afterEach(() => {
  cleanup();
  globalThis.localStorage?.clear();
});
