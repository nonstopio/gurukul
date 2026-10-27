import { vi } from 'vitest';

// Every test file gets a silent logger; the logging tests inspect these spies.
vi.mock('firebase-functions/logger', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
