# Working on `apps/web/`

The single React + Vite app. Three areas share it, gated by role claims:
learner (`/`), Kulapati console (`/kulapati`), Vyasa Studio (`/studio`).
Read the root `CLAUDE.md` and `.claude/skills/gurukul-design/SKILL.md` first.

| Path                                       | Owns                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `src/main.tsx`                             | Boot: mounts `<App />` into `#root`                                             |
| `src/App.tsx`                              | Global search around the page for the current path; sets the document title     |
| `src/route-paths.ts`, `src/routes.tsx`     | Every path, and its screen. React Router replaces the map in M1                 |
| `src/HomePage.tsx`, `src/NotFoundPage.tsx` | Placeholder home; the not-found page                                            |
| `src/changelog/`                           | The changelog — see its `CLAUDE.md`                                             |
| `src/navigation/`                          | Global search — see its `CLAUDE.md`                                             |
| `src/styles.css`                           | Page-level styles only; components live in `packages/ui`                        |
| `scripts/`                                 | Build-time glue run with tsx: `changelog-releases.ts`, `validate-navigation.ts` |
| `public/`                                  | Static assets (NonStop logo)                                                    |
| `test/`                                    | Vitest + Testing Library + axe-core, jsdom. 100% coverage of `src/`             |
| `.env.example`                             | Public Firebase web config keys (`VITE_FIREBASE_*`)                             |

- From M1, data access goes through small typed modules (`src/data/*`) that take the
  Firestore instance as a parameter, so tests can pass the emulator or a fake.
- Query by role or by `getByRole`/`getByLabelText` in tests, not by class name.
- No course-specific code in the player: if a course needs it, it is a block type.

```bash
npm run dev -w @gurukul/web
npm run coverage -w @gurukul/web
npm run build -w @gurukul/web
```
