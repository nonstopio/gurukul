// Bootstrap: make the first Kulapati. Run once, on the maintainer's machine, with an admin
// credential (gcloud auth application-default login). Never in CI.
//   npm run grant-kulapati -- you@nonstopio.com
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { grantKulapati } from '../firebase/functions/lib/set-roles.js';
import { firebaseRoleAdmin } from '../firebase/functions/lib/stores.js';

initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'nonstop-gurukul' });
const auth = getAuth();
const admin = firebaseRoleAdmin(auth, getFirestore());

try {
  const uid = await grantKulapati(
    { uidForEmail: async (email) => (await auth.getUserByEmail(email)).uid, admin },
    process.argv[2],
  );
  console.log(`${process.argv[2]} (${uid}) is now a Kulapati. They must sign in again.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
