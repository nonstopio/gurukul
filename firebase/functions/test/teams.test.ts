import { describe, expect, it, vi } from 'vitest';
import { handleTeamWrite } from '../src/teams.js';
import type { TeamStore } from '../src/teams.js';

const store = (): TeamStore => ({ setMembership: vi.fn().mockResolvedValue(2) });

describe('handleTeamWrite', () => {
  it('adds the team to people who joined and removes it from people who left', async () => {
    const s = store();
    const out = await handleTeamWrite(
      s,
      'platform',
      { memberEmails: ['a@x.com', 'b@x.com'] },
      { memberEmails: ['b@x.com', 'c@x.com'] },
    );
    expect(out).toEqual({ added: 2, removed: 2 });
    expect(s.setMembership).toHaveBeenCalledWith('platform', ['c@x.com'], true);
    expect(s.setMembership).toHaveBeenCalledWith('platform', ['a@x.com'], false);
  });
  it('treats a new team as all joined and a deleted team as all left', async () => {
    const s = store();
    await handleTeamWrite(s, 'qa', undefined, { memberEmails: ['a@x.com'] });
    expect(s.setMembership).toHaveBeenLastCalledWith('qa', ['a@x.com'], true);
    await handleTeamWrite(s, 'qa', { memberEmails: ['a@x.com'] }, undefined);
    expect(s.setMembership).toHaveBeenLastCalledWith('qa', ['a@x.com'], false);
  });
  it('writes nothing when the members did not change, or the team has none', async () => {
    const s = store();
    const same = { memberEmails: ['a@x.com'] };
    expect(await handleTeamWrite(s, 'qa', same, same)).toEqual({ added: 0, removed: 0 });
    await handleTeamWrite(s, 'qa', {}, {});
    expect(s.setMembership).not.toHaveBeenCalled();
  });
});
