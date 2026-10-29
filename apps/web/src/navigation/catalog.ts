import type { AreaNavigation, Destination, Role } from './types';

/** Every area's metadata, found by file: adding `areas/<slug>.ts` is all it takes. */
export function collectAreas(
  modules: Record<string, { navigation: AreaNavigation }>,
): AreaNavigation[] {
  return Object.keys(modules)
    .sort()
    .map((path) => (modules[path] as { navigation: AreaNavigation }).navigation);
}

export const allowed = (needed: readonly Role[] | undefined, roles: readonly Role[]) =>
  !needed || needed.some((r) => roles.includes(r));

/**
 * The pages this person can open, in catalog order. Access is filtered BEFORE matching, so a
 * page somebody cannot open is never ranked, counted or shown. The UI gate is convenience only:
 * Firestore rules are the enforcement.
 */
export function destinationsFor(
  areas: readonly AreaNavigation[],
  roles: readonly Role[],
): Destination[] {
  return areas
    .filter((a) => allowed(a.roles, roles))
    .flatMap((a) =>
      a.pages
        .filter((p) => allowed(p.roles, roles))
        .map((p) => ({
          id: p.id,
          path: p.path,
          label: p.label,
          areaName: a.name,
          description: p.description ?? '',
          keywords: [...(a.keywords ?? []), ...(p.keywords ?? [])],
        })),
    );
}
