import { Button, useToast } from '@gurukul/ui';
import { useId, useState } from 'react';
import { bridgeFailure } from '../../desktop/bridge';
import type { GurukulDesktop, SessionRef, SourcesFolder } from '../../desktop/bridge';
import { toastError } from '../../errors';
import { log } from '../../log';
import { filesLabel } from './sources';

/** What Finder or Explorer is called on this computer, for the "Show in …" button. */
export function revealLabel(platform: string): string {
  if (platform === 'darwin') return 'Show in Finder';
  if (platform === 'win32') return 'Show in Explorer';
  return 'Show the folder';
}

/**
 * The start dialog's Sources offer (`DSK-20`): a folder of the Educator's own material that the
 * agent may read, chosen in the system's folder dialog. The shell remembers the folder for the
 * session; this side shows only the display path and the number of files. What the agent reads
 * goes to Anthropic, so the offer says so beside the button.
 */
export function SourcesOffer({
  sources,
  session,
  platform,
  suggestedName,
}: {
  sources: Pick<GurukulDesktop['sources'], 'choose' | 'reveal'>;
  /** The session the folder is for: made by the dialog before the session starts. */
  session: SessionRef;
  /** `info().platform`: names Finder or Explorer. */
  platform: string;
  /** The course slug, so the folder dialog starts in `Documents/Gurukul Studio/{slug}/sources`. */
  suggestedName?: string | undefined;
}) {
  const toast = useToast();
  const titleId = useId();
  const [folder, setFolder] = useState<SourcesFolder | null>(null);
  const [choosing, setChoosing] = useState(false);

  const choose = async () => {
    setChoosing(true);
    try {
      const chosen = await sources.choose({
        ...session,
        ...(suggestedName !== undefined && { suggestedName }),
      });
      if (chosen) setFolder(chosen);
    } catch (error) {
      log.error('Sources folder not chosen', error, { sessionId: session.sessionId });
      toastError(
        toast,
        error,
        bridgeFailure(error) === 'not_available'
          ? 'This version of Gurukul Studio cannot use a Sources folder. Choose Check for updates in the app menu.'
          : 'That folder cannot be used. Choose another one.',
      );
    }
    setChoosing(false);
  };

  const reveal = () => {
    sources.reveal(session).catch((error: unknown) => {
      log.error('Sources folder not shown', error, { sessionId: session.sessionId });
      toastError(toast, error, 'The folder could not be opened.');
    });
  };

  return (
    <div className="ss-sources" role="group" aria-labelledby={titleId}>
      <p className="ss-sources__title" id={titleId}>
        Sources folder
      </p>
      <p className="sc-help">
        Optional. Notes, outlines or transcripts the agent may read, saved as text or Markdown. What
        it reads is sent to Anthropic too, so leave out client names and internal documents.
      </p>
      {folder ? (
        <>
          <p className="ss-sources__chosen">
            <span className="ss-sources__path">{folder.path}</span>
            <span className="sc-help">{filesLabel(folder)}</span>
          </p>
          <div className="ss-sources__actions">
            <Button variant="quiet" loading={choosing} onClick={() => void choose()}>
              Change folder
            </Button>
            <Button variant="quiet" onClick={reveal}>
              {revealLabel(platform)}
            </Button>
          </div>
        </>
      ) : (
        <div className="ss-sources__actions">
          <Button variant="secondary" loading={choosing} onClick={() => void choose()}>
            Choose a Sources folder
          </Button>
        </div>
      )}
    </div>
  );
}
