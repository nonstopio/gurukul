// Writes the first course to Firestore. Emulator when FIRESTORE_EMULATOR_HOST is set; otherwise
// it needs --production, GCLOUD_PROJECT and application-default credentials. All logic is in src/.
import { initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { gitAnswers, gitCourse } from '../src/git-course.ts';
import { seedCourse } from '../src/seed.ts';

const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const projectId = process.env.GCLOUD_PROJECT ?? (emulator ? 'demo-gurukul' : undefined);
if (!projectId || (!emulator && !process.argv.includes('--production'))) {
  console.error('Set FIRESTORE_EMULATOR_HOST, or pass --production with GCLOUD_PROJECT set.');
  process.exit(1);
}
const db = getFirestore(initializeApp({ projectId }));
const paths = await seedCourse(
  { set: async (path, data) => void (await db.doc(path).set(data)) },
  { course: gitCourse, answers: gitAnswers, now: Timestamp.now() },
);
console.warn(`Seeded ${paths.coursePath} and ${paths.answersPath} in ${projectId}.`);
