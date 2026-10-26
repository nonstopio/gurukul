---
paths:
  - 'apps/web/src/navigation/**'
  - 'apps/web/src/routes.tsx'
  - 'apps/web/src/route-paths.ts'
---

# Global search metadata

- A new, renamed or removed page edits its area's `apps/web/src/navigation/areas/<slug>.ts` in the
  same change. Every path in `route-paths.ts` is a page or `unlisted` with a reason.
- Area files are plain data: the `AreaNavigation` type import and nothing else.
- Never list a page that is not built. Search offering a dead end is worse than a missing result.
- Run `npm run validate:navigation`; the build and CI fail on exactly what it reports.
- Read `apps/web/src/navigation/CLAUDE.md` before changing the matcher, the catalog or the palette.
