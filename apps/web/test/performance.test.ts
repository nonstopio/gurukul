import { expect, it, vi } from 'vitest';

const getPerformance = vi.hoisted(() => vi.fn());
vi.mock('firebase/performance', () => ({ getPerformance }));

import { startPerformance } from '../src/performance';

it('starts Performance Monitoring on the Firebase app', () => {
  const app = { name: 'app' };
  startPerformance(app as never);
  expect(getPerformance).toHaveBeenCalledWith(app);
});
