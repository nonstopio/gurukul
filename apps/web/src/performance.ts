import type { FirebaseApp } from 'firebase/app';
import { getPerformance } from 'firebase/performance';

/**
 * Starts Firebase Performance Monitoring: page load and network request timings, no personal data.
 * Its own chunk, fetched by `main.tsx` after the app mounts, so it never counts against the initial
 * bundle budget.
 */
export function startPerformance(app: FirebaseApp): void {
  getPerformance(app);
}
