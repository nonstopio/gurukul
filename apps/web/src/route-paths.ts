/**
 * Every path the app serves. `routes.tsx` must map each one to a screen (TypeScript enforces it),
 * and every one must be classified in an area's navigation (`npm run validate:navigation`).
 * Kept apart from `routes.tsx` so the validator can read it without loading React screens.
 */
export const ROUTE_PATHS = ['/', '/changelog', '/kulapati', '/studio'] as const;

export type RoutePath = (typeof ROUTE_PATHS)[number];
