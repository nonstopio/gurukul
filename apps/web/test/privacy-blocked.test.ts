import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { acceptPolicy, hasAcceptedPolicy, usePolicyAccepted } from '../src/privacy/policy';

// Alone in its file: the in-memory fallback lives for the whole module.
it('still lasts the visit when storage is blocked', () => {
  const fail = () => {
    throw new Error('no');
  };
  vi.stubGlobal('localStorage', { getItem: fail, setItem: fail, clear: () => {} });
  const { result } = renderHook(() => usePolicyAccepted());
  expect(hasAcceptedPolicy()).toBe(false);
  expect(result.current).toBe(false);
  expect(() => acceptPolicy()).not.toThrow();
  expect(hasAcceptedPolicy()).toBe(false);
  expect(renderHook(() => usePolicyAccepted()).result.current).toBe(true);
});
