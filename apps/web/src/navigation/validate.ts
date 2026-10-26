import type { AreaNavigation, Role } from './types';

const ROLES: readonly Role[] = ['shishya', 'acharya', 'kulapati'];

/**
 * Checks navigation metadata against the route table. Returns problems as sentences; empty means
 * clean. Run by `npm run validate:navigation`, the build, CI, and a Claude hook after edits.
 *
 * - every route in `routes.tsx` is classified: a page, or `unlisted` with a reason;
 * - every page and unlisted entry points at a route that exists;
 * - page ids, page paths and area slugs are unique;
 * - labels are non-empty; roles are real roles; keywords are non-empty strings.
 */
export function validateNavigation(
  areas: readonly AreaNavigation[],
  routes: readonly string[],
): string[] {
  const problems: string[] = [];
  const routeSet = new Set(routes);
  const classified = new Map<string, string>();
  const ids = new Set<string>();
  const slugs = new Set<string>();

  const claim = (path: string, by: string) => {
    const prior = classified.get(path);
    if (prior) problems.push(`${by}: route ${path} is already classified by ${prior}`);
    else classified.set(path, by);
    if (!routeSet.has(path)) problems.push(`${by}: route ${path} does not exist in routes.tsx`);
  };
  const checkRoles = (roles: readonly string[] | undefined, by: string) => {
    for (const r of roles ?? []) {
      if (!ROLES.includes(r as Role)) problems.push(`${by}: unknown role "${r}"`);
    }
  };
  const checkKeywords = (keywords: readonly string[] | undefined, by: string) => {
    if ((keywords ?? []).some((k) => typeof k !== 'string' || !k.trim())) {
      problems.push(`${by}: keywords must be non-empty strings`);
    }
  };

  for (const area of areas) {
    if (slugs.has(area.slug)) problems.push(`${area.slug}: area slug is used twice`);
    slugs.add(area.slug);
    if (!area.name.trim()) problems.push(`${area.slug}: area name is empty`);
    checkRoles(area.roles, area.slug);
    checkKeywords(area.keywords, area.slug);

    for (const page of area.pages) {
      const by = `${area.slug} › ${page.id}`;
      if (ids.has(page.id)) problems.push(`${by}: page id is used twice`);
      ids.add(page.id);
      if (!page.label.trim()) problems.push(`${by}: label is empty`);
      checkRoles(page.roles, by);
      checkKeywords(page.keywords, by);
      claim(page.path, by);
    }
    for (const path of Object.keys(area.unlisted ?? {})) {
      claim(path, `${area.slug} › unlisted ${path}`);
    }
  }

  for (const route of routes) {
    if (!classified.has(route)) {
      problems.push(
        `${route}: route is not classified — list it as a page in an area's navigation, or add it to that area's unlisted map with a context or excluded reason`,
      );
    }
  }
  return problems;
}
