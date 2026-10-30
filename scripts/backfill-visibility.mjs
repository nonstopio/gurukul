// One-off, before the visibility rules reach production. Run once, on the maintainer's machine,
// with an admin credential (gcloud auth application-default login). Never in CI. Safe to re-run.
//   npm run backfill-visibility            # dry run: says what it would write
//   npm run backfill-visibility -- --apply
//
// 1. Every course document with no `visibility` gets `public` (a listing only returns courses that
//    say who may open them; without this, existing courses would vanish from the catalogue).
// 2. Every person on a team in `teams/` gets that team id on `users/{uid}.teamIds`, which
//    `teams` visibility reads (the `onTeamWritten` trigger keeps it right from then on).
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { handleTeamWrite } from '../firebase/functions/src/teams.js';
import { firestoreTeamStore } from '../firebase/functions/src/stores.js';

const apply = process.argv.includes('--apply');
initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'nonstop-gurukul' });
const db = getFirestore();

const courses = await db.collection('courses').get();
const missing = courses.docs.filter((d) => d.get('visibility') === undefined);
console.log(`${missing.length} of ${courses.size} courses have no visibility.`);
if (apply) {
  for (const d of missing) await d.ref.update({ visibility: 'public', visibleTeamIds: [] });
}

const teams = await db.collection('teams').get();
const store = firestoreTeamStore(db);
for (const t of teams.docs) {
  const members = t.get('memberEmails') ?? [];
  if (apply) {
    const { added } = await handleTeamWrite(store, t.id, undefined, { memberEmails: members });
    console.log(`team ${t.id}: ${added} of ${members.length} members have a profile.`);
  } else {
    console.log(`team ${t.id}: ${members.length} members would be synced.`);
  }
}
console.log(apply ? 'Done.' : 'Dry run only. Add --apply to write.');
