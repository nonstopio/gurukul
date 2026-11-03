import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_URL, AUTH_URL, FIRESTORE_URL, PROJECT_ID } from './env';

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
  'courses/educator-onboarding',
  'courses/educator-onboarding/private/answers',
  'teams/educator-candidates',
  'config/org',
];

/**
 * One request. A 409 (`ABORTED`, "Transaction lock timeout") means a trigger from the previous test
 * is still finishing a transaction while a reset clears the database; Firestore says to retry it.
 */
async function call(url: string, init: RequestInit, what: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    if (res.status === 409 && attempt < 5) {
      await new Promise((done) => setTimeout(done, 500 * attempt));
      continue;
    }
    throw new Error(`${what} failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Seeds both courses with the repo's own seed script, then keeps a copy of what it wrote (read
 * back through the REST API) so a reset can restore it in milliseconds instead of running the
 * script again. Called once, from global setup.
 */
export async function seedAndSnapshot(): Promise<void> {
  const seeded = spawnSync('npm', ['run', 'seed'], {
    cwd: ROOT,
    // SITE_URL: the course's diagrams load from the preview under test, not the live site.
    env: {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: FIRESTORE_URL.replace('http://', ''),
      SITE_URL: APP_URL,
    },
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
 * Makes a signed-in person an Educator and/or Admin, the way the `setRoles` function does: custom
 * claims on the Auth account, and the `roles` mirror on `users/{uid}`. The running app notices the
 * mirror change and refreshes its token, so no reload is needed.
 */
export async function grantRoles(email: string, roles: Array<'educator' | 'admin'>): Promise<void> {
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
  const values = ['learner', ...roles].map((stringValue) => ({ stringValue }));
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
 * last Quiz instead of clicking through twenty-two lessons. The `percent` is left at 0: the
 * progress trigger recomputes it from the course, as it does for a real write.
 */
export async function seedProgress(
  email: string,
  courseId: string,
  done: { lessons: string[]; passedQuizzes: string[] },
): Promise<void> {
  const uid = await uidOf(email);
  const now = { timestampValue: new Date().toISOString() };
  const passed = Object.fromEntries(
    done.passedQuizzes.map((id) => [
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
    quiz: { mapValue: { fields: passed } },
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

/** Every lesson and Quiz id of a seeded course, read from the emulator. */
export async function itemIds(courseId: string): Promise<{ lessons: string[]; quizzes: string[] }> {
  type Value = {
    stringValue?: string;
    mapValue?: { fields: Record<string, Value> };
    arrayValue?: { values?: Value[] };
  };
  const res = await call(`${DOCS}/courses/${courseId}`, { headers: OWNER }, 'Reading a course');
  const { fields } = (await res.json()) as { fields: Record<string, Value> };
  const items = (fields.chapters?.arrayValue?.values ?? []).flatMap(
    (chapter) => chapter.mapValue?.fields.items?.arrayValue?.values ?? [],
  );
  const ids = (type: string) =>
    items
      .map((item) => item.mapValue?.fields ?? {})
      .filter((f) => f.type?.stringValue === type)
      .map((f) => f.id?.stringValue ?? '');
  return { lessons: ids('lesson'), quizzes: ids('quiz') };
}

/**
 * The BlurHash stored in a course document's upload (the first one in it), read straight from the
 * emulator: the Studio works it out in the browser, so only the stored course shows it was kept.
 */
export async function storedBlurHash(coursePath: string): Promise<string | undefined> {
  const res = await call(`${DOCS}/${coursePath}`, { headers: OWNER }, 'Reading a course');
  const found = /"blurHash":\s*\{\s*"stringValue":\s*"([^"]+)"/.exec(await res.text());
  return found?.[1];
}

/** A document's fields (`undefined` while it does not exist), read past the rules. */
export async function readDoc(path: string): Promise<Record<string, unknown> | undefined> {
  const res = await fetch(`${DOCS}/${path}`, { headers: OWNER });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Reading ${path} failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { fields: Record<string, unknown> }).fields;
}

/**
 * How many times a document changed over `ms`: its `updateTime`, read every 100 ms. Two writes
 * closer together than that count once, so it undercounts a burst but never misses a loop, which
 * is what it is for: a page left open must not keep writing.
 */
export async function countChanges(path: string, ms: number): Promise<number> {
  const updated = async () => {
    const res = await call(`${DOCS}/${path}`, { headers: OWNER }, `Reading ${path}`);
    return ((await res.json()) as { updateTime: string }).updateTime;
  };
  let last = await updated();
  let changes = 0;
  for (const end = Date.now() + ms; Date.now() < end;) {
    await new Promise((done) => setTimeout(done, 100));
    const now = await updated();
    if (now !== last) changes += 1;
    last = now;
  }
  return changes;
}

/** Changes one top-level string field of a seeded course, e.g. its `status`, past the rules. */
export async function setCourseField(
  courseId: string,
  field: string,
  value: string,
): Promise<void> {
  await call(
    `${DOCS}/courses/${courseId}?updateMask.fieldPaths=${field}`,
    {
      method: 'PATCH',
      headers: OWNER,
      body: JSON.stringify({ fields: { [field]: { stringValue: value } } }),
    },
    `Setting ${field} on ${courseId}`,
  );
}
