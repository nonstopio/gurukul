import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
afterEach(cleanup);
// Pariksha drafts live in localStorage; each test starts without one.
// Some files run in the node environment, which has no localStorage.
afterEach(() => globalThis.localStorage?.clear());
