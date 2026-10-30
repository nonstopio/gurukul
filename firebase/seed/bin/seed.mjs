// Writes the first course to Firestore. Emulator when FIRESTORE_EMULATOR_HOST is set; otherwise
// it needs --production, GCLOUD_PROJECT and application-default credentials. All logic is in src/.
// The course's diagrams are linked from SITE_URL when set (the end-to-end run passes its local
// preview), otherwise from the live site.
import { initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
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
const paths = await seedCourse(seedDb, {
  course: gitCourseAt(process.env.SITE_URL || DEFAULT_SITE),
  answers: gitAnswers,
  now: Timestamp.now(),
});
const org = await seedOrgConfig(seedDb);
console.warn(`Seeded ${paths.coursePath} and ${paths.answersPath} in ${projectId}.`);
console.warn(
  `${paths.draftPath}: ${paths.draftCreated ? 'created from the course' : 'already there, kept'}.`,
);
console.warn(`${org.path}: ${org.created ? 'created with the defaults' : 'already there, kept'}.`);
