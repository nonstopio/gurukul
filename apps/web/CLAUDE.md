# Working on `apps/web/`

The single React + Vite app. Three areas share it, gated by role claims:
learner (`/`), Kulapati console (`/kulapati`), Vyasa Studio (`/studio`).
Read the root `CLAUDE.md` and `.claude/skills/gurukul-design/SKILL.md` first.

| Path                                                                      | Owns                                                                                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.tsx`                                                            | Boot: initialises Firebase and mounts `<App />` into `#root`                                                                        |
| `src/App.tsx`, `src/Shell.tsx`                                            | The sign-in gate; the signed-in chrome (sidebar from navigation metadata, search, title)                                            |
| `src/auth/`                                                               | `AuthProvider`/`useSession` (roles from claims), `RequireRole`, sign-in and not-allowed pages, the `AuthService` port over Firebase |
| `src/firebase.ts`                                                         | Firebase init from `VITE_FIREBASE_*`; `VITE_USE_EMULATORS` switch                                                                   |
| `src/route-paths.ts`, `src/routes.tsx`                                    | Every path, and its screen; `appRoutes()` for React Router                                                                          |
| `src/HomePage.tsx`, `src/ConsolePage.tsx`, `src/NotFoundPage.tsx`         | Home, the console and studio landings, not-found                                                                                    |
| `src/data/`                                                               | `LearnerData` port + `firebaseLearnerData` (bounded queries), `DataProvider`, `useAsync`                                            |
| `src/learn/`, `src/player/`                                               | Pure learner view-model helpers; one renderer per block type (`blocks.tsx`)                                                         |
| `src/HomePage.tsx`, `CoursesPage.tsx`, `CoursePage.tsx`, `LessonPage.tsx` | Home, catalogue, course overview, lesson player                                                                                     |
| `src/changelog/`                                                          | The changelog — see its `CLAUDE.md`                                                                                                 |
| `src/navigation/`                                                         | Global search — see its `CLAUDE.md`                                                                                                 |
| `src/styles.css`                                                          | Page-level styles only; components live in `packages/ui`                                                                            |
| `scripts/`                                                                | Build-time glue run with tsx: `changelog-releases.ts`, `validate-navigation.ts`                                                     |
| `public/`                                                                 | Static assets (NonStop logo)                                                                                                        |
| `test/`                                                                   | Vitest + Testing Library + axe-core, jsdom. 100% coverage of `src/`                                                                 |
| `.env.example`                                                            | Public Firebase web config keys (`VITE_FIREBASE_*`)                                                                                 |

- From M1, data access goes through small typed modules (`src/data/*`) that take the
  Firestore instance as a parameter, so tests can pass the emulator or a fake.
- Query by role or by `getByRole`/`getByLabelText` in tests, not by class name.
- No course-specific code in the player: if a course needs it, it is a block type.

```bash
npm run dev -w @gurukul/web
npm run coverage -w @gurukul/web
npm run build -w @gurukul/web
```
