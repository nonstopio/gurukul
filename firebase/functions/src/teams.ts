import { log } from './logging/log.js';

/** Where a team's members are kept on their profiles. `stores.ts` adapts the Admin SDK. */
export interface TeamStore {
  /** Adds (`on`) or removes the team id on the profile of each email that has one; returns how many profiles changed. */
  setMembership(teamId: string, emails: string[], on: boolean): Promise<number>;
}

const emailsOf = (team: { memberEmails?: string[] } | undefined): string[] =>
  team?.memberEmails ?? [];

/**
 * `teams/{id}` was written: copies the change onto the members' profiles (`users/{uid}.teamIds`),
 * which a course's `teams` visibility reads. Only the emails that joined or left are touched.
 * A deleted team empties the list, so every former member loses it.
 */
export async function handleTeamWrite(
  store: TeamStore,
  teamId: string,
  before: { memberEmails?: string[] } | undefined,
  after: { memberEmails?: string[] } | undefined,
): Promise<{ added: number; removed: number }> {
  const was = new Set(emailsOf(before));
  const is = new Set(emailsOf(after));
  const joined = [...is].filter((e) => !was.has(e));
  const left = [...was].filter((e) => !is.has(e));
  const added = joined.length === 0 ? 0 : await store.setMembership(teamId, joined, true);
  const removed = left.length === 0 ? 0 : await store.setMembership(teamId, left, false);
  log.debug('Team membership synced', { teamId, added, removed });
  return { added, removed };
}
