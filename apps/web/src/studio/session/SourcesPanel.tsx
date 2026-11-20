import { Button, Callout, Skeleton } from '@gurukul/ui';
import { useCallback } from 'react';
import { useAsync } from '../../data/useAsync';
import type { GurukulDesktop, SourcesFolder } from '../../desktop/bridge';
import { log } from '../../log';
import { SourcesOffer } from './SourcesOffer';

/**
 * The workspace's Sources tab (`DSK-20`): which folder the session's agent reads, read from the shell
 * each time the tab opens (the Educator may have added files in Finder meanwhile), with Choose or
 * Change folder, Show in Finder or Explorer, the files the agent may read, and the notice that what
 * it reads is sent to Anthropic. The agent's tools ask the shell on every call, so a folder chosen
 * here is read from the next message on.
 */
export function SourcesPanel({
  sources,
  uid,
  sessionId,
  platform,
  suggestedName,
}: {
  sources: Pick<GurukulDesktop['sources'], 'list' | 'choose' | 'reveal'>;
  uid: string;
  sessionId: string;
  platform: string;
  /** The course slug, for the folder dialog's first folder; none for a new course. */
  suggestedName?: string | undefined;
}) {
  const load = useCallback(
    (): Promise<SourcesFolder | null> =>
      sources.list({ uid, sessionId }).catch((error: unknown) => {
        log.error('Sources folder not listed', error, { sessionId });
        throw error;
      }),
    [sources, uid, sessionId],
  );
  const listed = useAsync(load);

  if (listed.state === 'loading') {
    return (
      <div aria-busy="true" role="status" className="ss-sources">
        <span className="sr-only">Reading the Sources folder</span>
        <Skeleton shape="block" height={96} />
      </div>
    );
  }
  if (listed.state === 'error') {
    return (
      <Callout tone="warning" title="The Sources folder could not be read" role="alert">
        <p>Gurukul Studio did not answer. Try again; the session and the folder are kept.</p>
        <div className="load-actions">
          <Button variant="secondary" onClick={listed.retry}>
            Try again
          </Button>
        </div>
      </Callout>
    );
  }
  return (
    <SourcesOffer
      sources={sources}
      session={{ uid, sessionId }}
      platform={platform}
      suggestedName={suggestedName}
      initial={listed.value}
      where="workspace"
    />
  );
}
