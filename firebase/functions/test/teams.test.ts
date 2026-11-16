import { describe, expect, it, vi } from 'vitest';
import { handleTeamWrite } from '../src/teams.js';
import type { TeamStore } from '../src/teams.js';

/** An in-memory `teams/` and `users/`: `reconcile` reads the teams as they are when it runs. */
function world(teams: Record<string, string[]>, profiles: Record<string, string[]>) {
  const store: TeamStore = {
    reconcile: vi.fn(async (emails: string[]) => {
      let n = 0;
      for (const e of emails) {
        if (!(e in profiles)) continue;
        profiles[e] = Object.keys(teams).filter((id) => teams[id]?.includes(e));
        n += 1;
      }
      return n;
    }),
  };
  return { store, teams, profiles };
}

describe('handleTeamWrite', () => {
  it('reconciles everyone the write listed before or after, once each', async () => {
    const w = world(
      { platform: ['b@x.com', 'c@x.com'] },
      { 'a@x.com': ['platform'], 'b@x.com': [], 'c@x.com': [] },
    );
    const out = await handleTeamWrite(
      w.store,
      'platform',
      { memberEmails: ['a@x.com', 'b@x.com'] },
      { memberEmails: ['b@x.com', 'c@x.com'] },
    );
    expect(out).toEqual({ count: 3 });
    expect(w.store.reconcile).toHaveBeenCalledWith(['a@x.com', 'b@x.com', 'c@x.com']);
    expect(w.profiles).toEqual({
      'a@x.com': [],
      'b@x.com': ['platform'],
      'c@x.com': ['platform'],
    });
  });
  it('is idempotent: replaying the same event changes nothing', async () => {
    const w = world({ qa: ['a@x.com'] }, { 'a@x.com': [] });
    const before = { memberEmails: [] };
    const after = { memberEmails: ['a@x.com'] };
    await handleTeamWrite(w.store, 'qa', before, after);
    await handleTeamWrite(w.store, 'qa', before, after);
    expect(w.profiles['a@x.com']).toEqual(['qa']);
  });
  it('survives out-of-order delivery: a stale join event handled after the leave still ends right', async () => {
    const w = world({ qa: [] }, { 'a@x.com': ['qa'] });
    await handleTeamWrite(w.store, 'qa', { memberEmails: ['a@x.com'] }, { memberEmails: [] });
    await handleTeamWrite(w.store, 'qa', { memberEmails: [] }, { memberEmails: ['a@x.com'] });
    expect(w.profiles['a@x.com']).toEqual([]);
  });
  it('reconciles no one when the member set is unchanged: a rename, or the same people reordered', async () => {
    const w = world({ qa: ['a@x.com', 'b@x.com'] }, { 'a@x.com': ['qa'], 'b@x.com': ['qa'] });
    const team = { memberEmails: ['a@x.com', 'b@x.com'] };
    expect(await handleTeamWrite(w.store, 'qa', team, { ...team })).toEqual({ count: 0 });
    expect(
      await handleTeamWrite(w.store, 'qa', team, { memberEmails: ['b@x.com', 'a@x.com'] }),
    ).toEqual({ count: 0 });
    expect(w.store.reconcile).not.toHaveBeenCalled();
  });
  it('reconciles every member when a team is created or deleted', async () => {
    const w = world({}, { 'a@x.com': ['qa'] });
    expect(await handleTeamWrite(w.store, 'qa', { memberEmails: ['a@x.com'] }, undefined)).toEqual({
      count: 1,
    });
    expect(w.profiles['a@x.com']).toEqual([]);
    w.teams.qa = ['a@x.com'];
    await handleTeamWrite(w.store, 'qa', undefined, { memberEmails: ['a@x.com'] });
    expect(w.profiles['a@x.com']).toEqual(['qa']);
  });
  it('skips a person with no profile yet, and does nothing for an empty write', async () => {
    const w = world({ qa: ['new@x.com'] }, {});
    expect(
      await handleTeamWrite(w.store, 'qa', undefined, { memberEmails: ['new@x.com'] }),
    ).toEqual({
      count: 0,
    });
    await handleTeamWrite(w.store, 'qa', {}, undefined);
    expect(w.store.reconcile).toHaveBeenCalledOnce();
  });
});
