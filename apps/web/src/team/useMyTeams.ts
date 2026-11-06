import { EDUCATOR_TEAM_NAME, teamId } from '@gurukul/schema';
import type { Team } from '@gurukul/schema';
import { useCallback } from 'react';
import { useSession, useUser } from '../auth/AuthProvider';
import { useConsole } from '../console/ConsoleProvider';
import type { ConsoleData } from '../console/types';
import { useAsync } from '../data/useAsync';
import type { Loadable } from '../data/useAsync';

/** Reads the teams the Team area works on; see `useMyTeams`. */
export async function loadMyTeams(data: ConsoleData, admin: boolean, email: string) {
  return admin ? (await data.teamList()).filter((x) => x.createdAt > 0) : data.managedTeams(email);
}

/**
 * The teams the Team area works on. A Manager reads only the teams that list them (the one query
 * the rules let them make); an Admin reads every team, so they can follow and remind any of them.
 * A name in `config/org.teams` with no team document (`createdAt` 0) has no members and no report,
 * so it is left out. `reload` reads again when it changes.
 */
export function useMyTeams(reload = 0): Loadable<Team[]> {
  const { data } = useConsole();
  const admin = useSession().roles.includes('admin');
  const email = String(useUser().email);
  return useAsync(
    useCallback(async () => {
      void reload;
      return loadMyTeams(data, admin, email);
    }, [data, admin, email, reload]),
  );
}

const EDUCATOR_TEAM = teamId(EDUCATOR_TEAM_NAME);

/**
 * Whether this person may edit a team here: an Admin any, a Manager theirs except the Educator
 * course's team, which opens that course and so stays Admin-only (the rules say the same).
 */
export const editableHere = (team: Team, admin: boolean): boolean =>
  admin || team.id !== EDUCATOR_TEAM;
