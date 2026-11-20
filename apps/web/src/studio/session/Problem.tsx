import { Button, Callout, StateCard } from '@gurukul/ui';
import { useUpdateTheApp } from '../../desktop/DesktopUpdateItem';
import type { GurukulDesktop } from '../../desktop/bridge';
import type { AgentProblem } from './agent';

/*
 * Each reason the agent cannot go on, as the chat shows it: a card that names the problem and says
 * the next step in plain words (`.plan/22-desktop-studio.md`, Starting Claude Code). The sentences
 * come from the runtime (`problemOf`, `appProblem`); this file only gives them a title and an action.
 */

/** A sentence with `command` spans shown as code ("run `claude` and sign in"). */
export function Words({ text }: { text: string }) {
  return (
    <>{text.split('`').map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}</>
  );
}

const needsUpdate = (problem: AgentProblem) =>
  problem.code === 'app' && problem.reason === 'not_available';

const TITLE: Record<AgentProblem['code'], string> = {
  not_installed: 'Claude Code is not on this computer',
  too_old: 'Claude Code needs an update',
  not_signed_in: 'Sign in to Claude Code',
  plan_limit: 'Your Claude plan’s limit is reached',
  crashed: 'The agent stopped',
  app: 'The app did not answer',
  not_saved: 'The last turn is not saved',
  undo_unavailable: 'That turn cannot be undone',
};

const titleOf = (problem: AgentProblem) =>
  needsUpdate(problem) ? 'Update the app' : TITLE[problem.code];

/** Asks the shell for its update; for a shell too old for a call the session makes. */
export function UpdateTheAppButton({
  desktop,
  variant = 'primary',
}: {
  desktop: GurukulDesktop;
  variant?: 'primary' | 'secondary';
}) {
  const { checking, check } = useUpdateTheApp(desktop);
  return (
    <Button variant={variant} loading={checking} onClick={() => void check()}>
      Update the app
    </Button>
  );
}

/**
 * The agent cannot run (status `unavailable`): a card in place of the message box. Retry asks
 * `agent.status()` again and starts the agent; a shell too old for the agent asks for its update.
 */
export function UnavailableCard({
  problem,
  desktop,
  onRetry,
}: {
  problem: AgentProblem;
  desktop: GurukulDesktop;
  onRetry: () => void;
}) {
  const retry = (
    <Button variant={needsUpdate(problem) ? 'secondary' : 'primary'} onClick={onRetry}>
      {problem.code === 'crashed' ? 'Start it again' : 'Check again'}
    </Button>
  );
  return (
    <StateCard
      variant="error"
      headingAs="h3"
      title={titleOf(problem)}
      actions={
        needsUpdate(problem) ? (
          <>
            <UpdateTheAppButton desktop={desktop} />
            {retry}
          </>
        ) : (
          retry
        )
      }
    >
      <Words text={problem.message} />
    </StateCard>
  );
}

/**
 * Something to know while the session can still go on (a plan limit, a turn not written, whose
 * line in the chat offers Undo, an Undo that cannot be done, a call the app refused): a callout
 * above the message box.
 */
export function ProblemNote({
  problem,
  desktop,
}: {
  problem: AgentProblem;
  desktop: GurukulDesktop;
}) {
  return (
    <Callout
      tone={problem.code === 'plan_limit' ? 'tip' : 'warning'}
      title={titleOf(problem)}
      {...(problem.code === 'app' ? { mascot: 'error' as const } : {})}
    >
      <p>
        <Words text={problem.message} />
      </p>
      {needsUpdate(problem) ? <UpdateTheAppButton desktop={desktop} variant="secondary" /> : null}
    </Callout>
  );
}
