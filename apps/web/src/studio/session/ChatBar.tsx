import {
  Button,
  ChevronDownIcon,
  FolderIcon,
  IconButton,
  Menu,
  ProgressRing,
  SparkIcon,
  buttonClass,
  iconButtonClass,
} from '@gurukul/ui';
import type { MenuEntry } from '@gurukul/ui';
import type { AgentEffort, AgentModel, GurukulDesktop } from '../../desktop/bridge';
import { log } from '../../log';
import { SKILL_LABELS, SKILLS } from './prompt';
import { revealLabel } from './SourcesPanel';
import type { AgentSessionHandle } from './useAgentSession';

/** What the bar says for each pick; `null` is Claude Code's own default. Typed over the shell's lists. */
export const MODELS: Record<AgentModel, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
};
export const EFFORTS: Record<AgentEffort, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/** The percentage of the window used, rounded and kept at 99 until the window is full. */
export function contextPercent(used: number, window: number): number {
  return Math.min(100, Math.round((used / window) * 100));
}

/** The menu of one pick: Default first, the picked one marked, a choice restarts the agent. */
function pick<K extends string>(
  names: Record<K, string>,
  current: K | undefined,
  choose: (value: K | null) => void,
): MenuEntry[] {
  const entry = (value: K | null, label: string): MenuEntry => ({
    label,
    hint: (current ?? null) === value ? 'Selected' : '',
    onSelect: () => choose(value),
  });
  return [
    entry(null, 'Default'),
    ...(Object.keys(names) as K[]).map((key) => entry(key, names[key])),
  ];
}

/**
 * The composer's bottom bar: the model and the effort the agent runs with, how full its context is,
 * the session's Sources folder in Finder or Explorer, and a read-only list of the skills it has.
 * A new model or effort is applied by starting the agent again (`choose`), so both wait for a turn
 * to end. The context ring shows once a turn has reported usage.
 */
export function ChatBar({
  agent,
  sources,
  sessionId,
  platform,
}: {
  agent: AgentSessionHandle;
  sources: Pick<GurukulDesktop['sources'], 'reveal'>;
  sessionId: string;
  platform: string;
}) {
  const { session, usage, canChoose } = agent;
  const uid = (session as NonNullable<typeof session>).uid;
  const picker = (label: string, text: string, items: MenuEntry[]) => {
    const face = (
      <>
        <span className="sr-only">{label}:</span> <span>{text}</span>
        <ChevronDownIcon size={14} />
      </>
    );
    // A change restarts the agent, which a running turn would lose: wait for it to end.
    return canChoose ? (
      <Menu
        trigger={face}
        triggerClassName={buttonClass('quiet', 'ss-bar__pick', 'sm')}
        placement="top"
        align="start"
        items={items}
      />
    ) : (
      <Button variant="quiet" size="sm" className="ss-bar__pick" disabled>
        {face}
      </Button>
    );
  };
  const reveal = () => {
    sources.reveal({ uid, sessionId }).catch((error: unknown) => {
      log.error('Sources folder not shown', error, { sessionId });
    });
  };
  return (
    <div className="ss-bar" role="group" aria-label="Agent settings">
      {picker(
        'Model',
        session?.model ? MODELS[session.model] : 'Default model',
        pick(MODELS, session?.model, (model) => void agent.choose({ model })),
      )}
      {picker(
        'Effort',
        session?.effort ? EFFORTS[session.effort] : 'Default effort',
        pick(EFFORTS, session?.effort, (effort) => void agent.choose({ effort })),
      )}
      <span className="ss-bar__fill" />
      {usage ? (
        <span className="ss-bar__context">
          <ProgressRing
            value={contextPercent(usage.used, usage.window)}
            label="Context used"
            size={18}
            stroke={3}
            showValue={false}
          />
          <span aria-hidden="true">{contextPercent(usage.used, usage.window)}%</span>
        </span>
      ) : null}
      <IconButton label={revealLabel(platform)} tip="Sources folder" onClick={reveal}>
        <FolderIcon />
      </IconButton>
      <Menu
        label="Skills the agent has"
        tip="Skills"
        trigger={<SparkIcon />}
        triggerClassName={iconButtonClass()}
        placement="top"
        align="end"
        header={<span className="ss-bar__note">What the agent knows how to do. Read-only.</span>}
        items={SKILLS.map(({ name }) => ({
          label: (SKILL_LABELS[name] as { label: string }).label,
          hint: (SKILL_LABELS[name] as { hint: string }).hint,
          onSelect: () => undefined,
        }))}
      />
    </div>
  );
}
