// Optional: the daily roll-up (03:00 UTC) does this by itself, so run it only to not wait for the
// night after a deploy. On the maintainer's machine, with an admin credential
// (gcloud auth application-default login). Never in CI. Safe to re-run.
//   npm run backfill-summaries            # dry run: says which courses it would summarise
//   npm run backfill-summaries -- --apply
//
// Writes `courseSummaries/{id}` for every course whose summary is missing or out of date, and
// deletes a summary whose course is gone (`firebase/functions/src/summaries.ts`).
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { reconcileSummaries } from '../firebase/functions/src/summaries.js';
import { firestoreSummaryStore } from '../firebase/functions/src/stores.js';

const apply = process.argv.includes('--apply');
initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'nonstop-gurukul' });
const store = firestoreSummaryStore(getFirestore());

if (apply) {
  const { count, changed } = await reconcileSummaries(store);
  console.log(`${changed} of ${count} out-of-date course summaries written or removed. Done.`);
} else {
  const ids = await store.stale();
  console.log(`${ids.length} course summaries are missing or out of date: ${ids.join(', ')}`);
  console.log('Dry run only. Add --apply to write.');
}
