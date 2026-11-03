// Writes the seeded courses (Git, and the Educator course) to Firestore. Emulator when FIRESTORE_EMULATOR_HOST is set; otherwise
// it needs --production, GCLOUD_PROJECT and application-default credentials. All logic is in src/.
// The course's diagrams are linked from SITE_URL when set (the end-to-end run passes its local
// preview), otherwise from the live site.
import { EDUCATOR_TEAM_NAME, teamId } from '@gurukul/schema';
import { initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { educatorAnswers, educatorCourse } from '../src/educator-course.ts';
import { DEFAULT_SITE, gitAnswers, gitCourseAt } from '../src/git-course.ts';
import { seedCourse, seedOrgConfig } from '../src/seed.ts';

const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const projectId = process.env.GCLOUD_PROJECT ?? (emulator ? 'demo-gurukul' : undefined);
if (!projectId || (!emulator && !process.argv.includes('--production'))) {
  console.error('Set FIRESTORE_EMULATOR_HOST, or pass --production with GCLOUD_PROJECT set.');
  process.exit(1);
}
const db = getFirestore(initializeApp({ projectId }));
// gRPC status 6 is ALREADY_EXISTS: the document is there, so it is kept.
const ALREADY_EXISTS = 6;
const seedDb = {
  get: async (path) => (await db.doc(path).get()).data(),
  set: async (path, data) => void (await db.doc(path).set(data)),
  createIfMissing: async (path, data) => {
    try {
      await db.doc(path).create(data);
      return true;
    } catch (error) {
      if (error?.code === ALREADY_EXISTS) return false;
      throw error;
    }
  },
};
const now = Timestamp.now();
const seeded = [
  await seedCourse(seedDb, {
    course: gitCourseAt(process.env.SITE_URL || DEFAULT_SITE),
    answers: gitAnswers,
    now,
  }),
  // Not public: only the Educator candidates team opens it, and assigning it adds people there.
  await seedCourse(seedDb, {
    course: educatorCourse,
    answers: educatorAnswers,
    now,
    access: { visibility: 'teams', visibleTeamIds: [teamId(EDUCATOR_TEAM_NAME)] },
  }),
];
const org = await seedOrgConfig(seedDb, [EDUCATOR_TEAM_NAME]);
// The team document exists from the start and has no creator, so only an Admin may edit it.
await seedDb.createIfMissing(`teams/${teamId(EDUCATOR_TEAM_NAME)}`, {
  name: EDUCATOR_TEAM_NAME,
  memberEmails: [],
  createdAt: Date.now(),
});
const DRAFT = {
  created: 'created from the course',
  updated: 'updated to the course',
  kept: 'edited in Studio, kept: it does not have this version',
};
for (const paths of seeded) {
  console.warn(
    `Seeded ${paths.coursePath} (version ${paths.version}) and ${paths.answersPath} in ${projectId}.`,
  );
  console.warn(`${paths.draftPath}: ${DRAFT[paths.draft]}.`);
}
console.warn(`${org.path}: ${org.created ? 'created with the defaults' : 'already there, kept'}.`);
