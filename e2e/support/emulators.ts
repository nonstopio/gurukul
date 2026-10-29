import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTH_URL, FIRESTORE_URL, PROJECT_ID } from './env';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../..');
const SEED_FILE = resolve(here, '../dist/seed.json');

/** The emulators accept this fixed token as the project owner, which skips security rules. */
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const DOCS = `${FIRESTORE_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/** The documents the seed script writes; they are put back after every reset. */
const SEEDED_PATHS = [
  'courses/git-the-nonstop-way',
  'courses/git-the-nonstop-way/private/answers',
  'config/org',
];

async function call(url: string, init: RequestInit, what: string): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${await res.text()}`);
  return res;
}

/**
 * Seeds the Git course with the repo's own seed script, then keeps a copy of what it wrote (read
 * back through the REST API) so a reset can restore it in milliseconds instead of running the
 * script again. Called once, from global setup.
 */
export async function seedAndSnapshot(): Promise<void> {
  const seeded = spawnSync('npm', ['run', 'seed'], {
    cwd: ROOT,
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: FIRESTORE_URL.replace('http://', '') },
    encoding: 'utf8',
  });
  if (seeded.status !== 0)
    throw new Error(`npm run seed failed:\n${seeded.stdout}${seeded.stderr}`);
  const snapshot: Record<string, unknown> = {};
  for (const path of SEEDED_PATHS) {
    const res = await call(`${DOCS}/${path}`, { headers: OWNER }, `Reading ${path}`);
    snapshot[path] = ((await res.json()) as { fields: unknown }).fields;
  }
  mkdirSync(dirname(SEED_FILE), { recursive: true });
  writeFileSync(SEED_FILE, JSON.stringify(snapshot));
}

/** Every account and every document gone, then the seeded course back. Run before each test. */
export async function resetEmulators(): Promise<void> {
  await Promise.all([
    call(
      `${AUTH_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`,
      { method: 'DELETE' },
      'Clearing Auth',
    ),
    call(
      `${FIRESTORE_URL}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
      { method: 'DELETE' },
      'Clearing Firestore',
    ),
  ]);
  const snapshot = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as Record<string, unknown>;
  for (const [path, fields] of Object.entries(snapshot)) {
    await call(
      `${DOCS}/${path}`,
      { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields }) },
      `Restoring ${path}`,
    );
  }
}

export async function uidOf(email: string): Promise<string> {
  const res = await call(
    `${AUTH_URL}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
    { method: 'POST', headers: OWNER, body: JSON.stringify({ email: [email] }) },
    `Looking up ${email}`,
  );
  const users = ((await res.json()) as { users?: Array<{ localId: string }> }).users;
  if (!users?.[0]) throw new Error(`No Auth emulator account for ${email}`);
  return users[0].localId;
}

/**
 * Makes a signed-in person an Acharya and/or Kulapati, the way the `setRoles` function does: custom
 * claims on the Auth account, and the `roles` mirror on `users/{uid}`. The running app notices the
 * mirror change and refreshes its token, so no reload is needed.
 */
export async function grantRoles(
  email: string,
  roles: Array<'acharya' | 'kulapati'>,
): Promise<void> {
  const uid = await uidOf(email);
  const claims = Object.fromEntries(roles.map((r) => [r, true]));
  await call(
    `${AUTH_URL}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
    {
      method: 'POST',
      headers: OWNER,
      body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(claims) }),
    },
    'Setting custom claims',
  );
  const values = ['shishya', ...roles].map((stringValue) => ({ stringValue }));
  await call(
    `${DOCS}/users/${uid}?updateMask.fieldPaths=roles`,
    {
      method: 'PATCH',
      headers: OWNER,
      body: JSON.stringify({ fields: { roles: { arrayValue: { values } } } }),
    },
    'Mirroring roles',
  );
}

/**
 * Writes a learner's progress document straight into the emulator, so a journey can start at the
 * last Pariksha instead of clicking through twenty-two lessons. The `percent` is left at 0: the
 * progress trigger recomputes it from the course, as it does for a real write.
 */
export async function seedProgress(
  email: string,
  courseId: string,
  done: { lessons: string[]; passedParikshas: string[] },
): Promise<void> {
  const uid = await uidOf(email);
  const now = { timestampValue: new Date().toISOString() };
  const passed = Object.fromEntries(
    done.passedParikshas.map((id) => [
      id,
      {
        mapValue: {
          fields: {
            best: { doubleValue: 1 },
            passed: { booleanValue: true },
            attempts: { integerValue: '1' },
            lastAttemptAt: now,
          },
        },
      },
    ]),
  );
  const fields = {
    uid: { stringValue: uid },
    courseId: { stringValue: courseId },
    courseVersion: { integerValue: '1' },
    startedAt: now,
    lastItemId: { nullValue: null },
    lastActiveAt: now,
    completedItemIds: {
      arrayValue: { values: done.lessons.map((stringValue) => ({ stringValue })) },
    },
    pariksha: { mapValue: { fields: passed } },
    percent: { integerValue: '0' },
    completedAt: { nullValue: null },
    certificateId: { nullValue: null },
  };
  await call(
    `${DOCS}/progress/${uid}_${courseId}`,
    { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields }) },
    'Seeding progress',
  );
}
