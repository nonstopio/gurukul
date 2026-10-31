// One-off, after learners can no longer pick their own team. Run once, on the maintainer's machine,
// with an admin credential (gcloud auth application-default login). Never in CI. Safe to re-run.
//   npm run backfill-teams            # dry run: says what it would write
//   npm run backfill-teams -- --apply
//
// Everyone who picked a team on their profile (`users/{uid}.team`) is added to that team's member
// list (`teams/{id}.memberEmails`), creating the team when only its name exists. The `onTeamWritten`
// trigger then sets their `teamIds`. The old `team` field is left as it is.
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { teamId } from '../packages/schema/src/index.js';

const MAX_MEMBERS = 500; // the rules' limit on `teams/{id}.memberEmails`

const apply = process.argv.includes('--apply');
initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'nonstop-gurukul' });
const db = getFirestore();

// A name already on the org list keeps its spelling.
const orgNames = new Map(
  ((await db.doc('config/org').get()).get('teams') ?? []).map((n) => [teamId(n), n]),
);
const picked = new Map();
for (const u of (await db.collection('users').get()).docs) {
  const name = u.get('team');
  const email = u.get('email');
  if (typeof name !== 'string' || name.trim() === '' || typeof email !== 'string') continue;
  const id = teamId(name);
  const entry = picked.get(id) ?? { name: orgNames.get(id) ?? name.trim(), emails: new Set() };
  entry.emails.add(email.toLowerCase());
  picked.set(id, entry);
}

for (const [id, { name, emails }] of picked) {
  const ref = db.collection('teams').doc(id);
  const existing = await ref.get();
  const listed = existing.exists ? (existing.get('memberEmails') ?? []) : [];
  const members = [...new Set([...listed, ...emails])];
  const added = members.length - listed.length;
  if (members.length > MAX_MEMBERS) {
    console.log(`team ${id}: SKIPPED, ${members.length} members is over ${MAX_MEMBERS}.`);
    continue;
  }
  console.log(
    `team ${id} (${name}): ${added} added to ${listed.length}${existing.exists ? '' : ', new team'}.`,
  );
  if (!apply || added === 0) continue;
  if (existing.exists) await ref.update({ memberEmails: members });
  else {
    await ref.set({ name, memberEmails: members, createdAt: Date.now() });
    if (!orgNames.has(id)) {
      await db.doc('config/org').set({ teams: FieldValue.arrayUnion(name) }, { merge: true });
    }
  }
}
console.log(apply ? 'Done.' : 'Dry run only. Add --apply to write.');
