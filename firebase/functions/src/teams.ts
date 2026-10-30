import { log } from './logging/log.js';

/** Where a team's members are kept on their profiles. `stores.ts` adapts the Admin SDK. */
export interface TeamStore {
  /**
   * For each email, in one transaction per email: reads the teams that list it now and sets the
   * profile's `teamIds` to exactly those. Emails without a profile are skipped. Returns how many
   * profiles it changed. State-based, so running it twice, or late, changes nothing.
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
 * reading the current state cannot.
 */
export async function handleTeamWrite(
  store: TeamStore,
  teamId: string,
  before: { memberEmails?: string[] } | undefined,
  after: { memberEmails?: string[] } | undefined,
): Promise<{ count: number }> {
  const affected = [...new Set([...emailsOf(before), ...emailsOf(after)])];
  const count = affected.length === 0 ? 0 : await store.reconcile(affected);
  log.debug('Team membership reconciled', { teamId, count });
  return { count };
}
