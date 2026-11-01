---
paths:
  - 'apps/web/src/**'
  - 'packages/ui/src/DataTable.tsx'
---

# Pagination

**Any list or table that can grow past one screen is paginated, 25 rows to a page.**

- Use `Pagination` from `@gurukul/ui` (Previous / Next, "Showing 1–25 of 148") in the `footer` of
  the `DataTable`, or under a list of cards. Do not invent "Load more" buttons or unbounded lists.
- The default is `DEFAULT_PAGE_SIZE` (25) from `@gurukul/ui`. Leave `pageSize` off; pass one only
  for a reason that is written next to it (a grid of cards that fits 12, for example).
- A list already in memory: slice it with `pageOf(rows, page)`. Reset to page 1 when a filter,
  search or tab changes.
- A list in Firestore: read one page at a time with `limit` and a cursor, keep the cursors of the
  pages already visited, and get the total with `getCountFromServer` (see `usersPage` and
  `auditPage` in `apps/web/src/console/firebase.ts`). Never read a whole collection to count it.
- Short, fixed lists (a role matrix, a few filters, a menu) are not paginated. A list bounded by
  the product to under 25 rows needs a `pageOf` only when the bound can change.
- Test the first page, the next page and the empty state.
