import { formatBytes } from '@gurukul/schema';
import {
  Button,
  Callout,
  DEFAULT_PAGE_SIZE,
  Pagination,
  Skeleton,
  pageOf,
  useToast,
} from '@gurukul/ui';
import { useCallback, useId, useState } from 'react';
import { useAsync } from '../../data/useAsync';
import type { GurukulDesktop, SourcesFolder } from '../../desktop/bridge';
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
 * The workspace's Sources tab (`DSK-20`): the session's Sources folder, a fixed place under
 * Documents that the shell makes on demand (`sources.ensure`; nobody picks a folder). Read from the
 * shell each time the tab opens, because the Educator may have added files in Finder meanwhile.
 * Shows the display path, the plain files the agent may read, Show in Finder or Explorer, and the
 * notice that what the agent reads is sent to Anthropic under the Educator's own Claude account.
 */
export function SourcesPanel({
  sources,
  uid,
  sessionId,
  platform,
  suggestedName,
}: {
  sources: Pick<GurukulDesktop['sources'], 'ensure' | 'reveal'>;
  uid: string;
  sessionId: string;
  platform: string;
  /** The course slug, so the folder is `Documents/Gurukul Studio/{slug}/sources`; none for a new course. */
  suggestedName?: string | undefined;
}) {
  const toast = useToast();
  const titleId = useId();
  const load = useCallback(
    (): Promise<SourcesFolder> =>
      sources
        .ensure({ uid, sessionId, ...(suggestedName !== undefined && { suggestedName }) })
        .catch((error: unknown) => {
          log.error('Sources folder not listed', error, { sessionId });
          throw error;
        }),
    [sources, uid, sessionId, suggestedName],
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
  const folder = listed.value;

  const reveal = () => {
    sources.reveal({ uid, sessionId }).catch((error: unknown) => {
      log.error('Sources folder not shown', error, { sessionId });
      toastError(toast, error, 'The folder could not be opened.');
    });
  };

  return (
    <div className="ss-sources" role="group" aria-labelledby={titleId}>
      <p className="ss-sources__title" id={titleId}>
        Sources folder
      </p>
      <p className="sc-help">
        Notes, outlines or transcripts the agent may read, saved as text or Markdown directly in
        this folder. What the agent reads is sent to Anthropic under your own Claude account, so
        leave out client names and internal documents.
      </p>
      <p className="ss-sources__chosen">
        <span className="ss-sources__path">{folder.path}</span>
        <span className="sc-help">{filesLabel(folder)}</span>
      </p>
      <div className="ss-sources__actions">
        <Button variant="quiet" onClick={reveal}>
          {revealLabel(platform)}
        </Button>
      </div>
      <SourceFiles key={folder.path} folder={folder} />
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
