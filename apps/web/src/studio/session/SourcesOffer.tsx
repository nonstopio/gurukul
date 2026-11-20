import { formatBytes } from '@gurukul/schema';
import { Button, DEFAULT_PAGE_SIZE, Pagination, pageOf, useToast } from '@gurukul/ui';
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

/** What is said about the folder: in the start dialog, after its notice about what is sent. */
const SAYS = {
  start:
    'Optional. Notes, outlines or transcripts the agent may read, saved as text or Markdown. What it reads is sent to Anthropic too, so leave out client names and internal documents.',
  workspace:
    'Notes, outlines or transcripts the agent may read, saved as text or Markdown directly in the folder. What the agent reads is sent to Anthropic under your own Claude account, so leave out client names and internal documents. A folder chosen or changed here is read from your next message on.',
} as const;

/**
 * The session's Sources folder (`DSK-20`): a folder of the Educator's own material that the agent
 * may read, chosen in the system's folder dialog. The shell remembers the folder for the session;
 * this side shows only the display path and the files. What the agent reads goes to Anthropic, so
 * the offer says so beside the button. The start dialog offers it before the session exists; the
 * workspace's Sources tab (`SourcesPanel`) shows the folder already chosen, with its files.
 */
export function SourcesOffer({
  sources,
  session,
  platform,
  suggestedName,
  initial = null,
  where = 'start',
}: {
  sources: Pick<GurukulDesktop['sources'], 'choose' | 'reveal'>;
  /** The session the folder is for: made by the dialog before the session starts. */
  session: SessionRef;
  /** `info().platform`: names Finder or Explorer. */
  platform: string;
  /** The course slug, so the folder dialog starts in `Documents/Gurukul Studio/{slug}/sources`. */
  suggestedName?: string | undefined;
  /** The folder already chosen, as `sources.list` gives it. */
  initial?: SourcesFolder | null;
  /** `workspace` lists the folder's files and words the notice for a session already running. */
  where?: keyof typeof SAYS;
}) {
  const toast = useToast();
  const titleId = useId();
  const [folder, setFolder] = useState<SourcesFolder | null>(initial);
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
      <p className="sc-help">{SAYS[where]}</p>
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
          {where === 'workspace' ? <SourceFiles key={folder.path} folder={folder} /> : null}
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

/** The plain files the agent may read, 25 to a page, each with its size. */
function SourceFiles({ folder }: { folder: SourcesFolder }) {
  const [page, setPage] = useState(1);
  const { files } = folder;
  if (files.length === 0) {
    return (
      <p className="sc-help">
        Save notes in the folder as text or Markdown, then open this tab again to see them here.
      </p>
    );
  }
  return (
    <>
      <ul className="ss-sources__files" aria-label="Files the agent may read">
        {pageOf(files, page).map((file) => (
          <li key={file.name} className="ss-sources__file">
            <span className="ss-sources__name">{file.name}</span>
            <span className="sc-help">{formatBytes(file.bytes)}</span>
          </li>
        ))}
      </ul>
      {files.length > DEFAULT_PAGE_SIZE ? (
        <Pagination
          page={page}
          total={files.length}
          onPageChange={setPage}
          label="Pages of files"
        />
      ) : null}
    </>
  );
}
