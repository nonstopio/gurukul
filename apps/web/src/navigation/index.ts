import { collectAreas } from './catalog';
import type { AreaNavigation } from './types';

export { destinationsFor } from './catalog';
export { indexDestinations, searchDestinations } from './search';
export type { AreaNavigation, Destination, PageNavigation, Role } from './types';

/** Every area's metadata: one file per area under `areas/`, found by Vite's glob. */
export const AREAS: AreaNavigation[] = collectAreas(
  import.meta.glob<{ navigation: AreaNavigation }>('./areas/*.ts', { eager: true }),
);
