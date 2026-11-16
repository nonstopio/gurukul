import { log } from './logging/log.js';

/** Where a team's members are kept on their profiles. `stores.ts` adapts the Admin SDK. */
export interface TeamStore {
  /**
   * For each email, in one transaction per email: reads the teams that list it now and sets the
   * profile's `teamIds` to exactly those, writing only when they differ. Emails without a profile
   * are skipped. Returns how many emails' profiles it changed. State-based, so running it twice, or
   * late, changes nothing.
   */
  reconcile(emails: string[]): Promise<number>;
}

const emailsOf = (team: { memberEmails?: string[] } | undefined): string[] =>
  team?.memberEmails ?? [];

/**
 * `teams/{id}` was written: brings each affected profile's `teamIds` (what a course's `teams`
 * visibility reads) in line with the teams as they are now. Affected is everyone the write listed
 * before or after. The event's own diff decides nothing: Firestore triggers deliver at least
 * once and not in order, so a diff replayed or reordered could leave a profile wrong, while
 * reading the current state cannot. A write that leaves the member set as it was (a rename)
 * reconciles no one: only `memberEmails` feeds `teamIds`, and any write that did change it, create
 * and delete included, carries that change in its own before and after.
 */
export async function handleTeamWrite(
  store: TeamStore,
  teamId: string,
  before: { memberEmails?: string[] } | undefined,
  after: { memberEmails?: string[] } | undefined,
): Promise<{ count: number }> {
  const was = new Set(emailsOf(before));
  const now = new Set(emailsOf(after));
  const same = was.size === now.size && [...now].every((e) => was.has(e));
  const affected = [...new Set([...was, ...now])];
  const count = same ? 0 : await store.reconcile(affected);
  log.debug('Team membership reconciled', { teamId, count });
  return { count };
}
