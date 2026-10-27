/** Ports and names shared by the config and the helpers. They match the repo's `firebase.json`. */
export const PROJECT_ID = 'demo-gurukul';
export const APP_PORT = 4173;
export const APP_URL = `http://127.0.0.1:${APP_PORT}`;
export const AUTH_URL = 'http://127.0.0.1:9099';
export const FIRESTORE_URL = 'http://127.0.0.1:8080';
export const HUB_URL = 'http://127.0.0.1:4400';

/** The seeded course (`firebase/seed/src/git-course.ts`). */
export const GIT_COURSE = {
  id: 'git-the-nonstop-way',
  title: 'Git, the NonStop Way',
  firstLesson: 'What Git solves',
};
