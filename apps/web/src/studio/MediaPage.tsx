import { Button, Callout, Card, EmptyState, buttonClass, useToast } from '@gurukul/ui';
import { useCallback } from 'react';
import { Link } from 'react-router';
import { useSession, useUser } from '../auth/AuthProvider';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { log } from '../log';
import { useStudio } from './StudioProvider';
import { MEDIA_KINDS, collectMedia } from './studioModel';
import type { MediaEntry, MediaKind } from './studioModel';

const HEADINGS: Record<MediaKind, string> = {
  video: 'Videos',
  image: 'Images',
  embed: 'Embeds',
  file: 'Files',
};

/** `/studio/media`: every link used in the courses the person can see, to reuse. No uploads in v1. */
export function MediaPage() {
  const { data } = useStudio();
  const { uid } = useUser();
  const kulapati = useSession().roles.includes('kulapati');
  const toast = useToast();
  const result = useAsync(
    useCallback(
      () => data.listCourses(uid, kulapati).then((rows) => collectMedia(rows)),
      [data, uid, kulapati],
    ),
  );

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.show('Link copied.', { tone: 'success' });
    } catch {
      log.warn('Copying a link failed');
      toast.show('Could not copy the link. Select it and copy by hand.', { tone: 'danger' });
    }
  };

  return (
    <main className="page studio-page">
      <h1 className="page__title">Media library</h1>
      <Callout tone="note" title="Links only, for now">
        <p>
          Gurukul does not store uploads yet. This lists the videos, images, embeds and files your
          courses already link to, so you can reuse them.
        </p>
      </Callout>
      <Loaded loadable={result}>
        {(entries) =>
          entries.length === 0 ? (
            <EmptyState
              title="No media yet"
              headingAs="h2"
              action={
                <Link className={buttonClass('secondary')} to="/studio">
                  Back to courses
                </Link>
              }
            >
              Videos, images, embeds and files you add to lessons are listed here.
            </EmptyState>
          ) : (
            <>
              {MEDIA_KINDS.map((kind) => {
                const group = entries.filter((e) => e.kind === kind);
                return group.length === 0 ? null : (
                  <section key={kind} aria-labelledby={`media-${kind}`} className="home-section">
                    <h2 id={`media-${kind}`}>
                      {HEADINGS[kind]} ({group.length})
                    </h2>
                    <ul className="sc-media">
                      {group.map((entry) => (
                        <MediaRow
                          key={entry.url}
                          entry={entry}
                          onCopy={() => void copy(entry.url)}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </>
          )
        }
      </Loaded>
    </main>
  );
}

function MediaRow({ entry, onCopy }: { entry: MediaEntry; onCopy: () => void }) {
  return (
    <li>
      <Card className="sc-media__row">
        <div className="sc-media__main">
          <p className="sc-media__label">{entry.label}</p>
          <p className="sc-media__url">{entry.url}</p>
          <p className="sc-help">
            Used in{' '}
            {entry.usedIn.map((u, i) => (
              <span key={`${u.courseId}-${u.itemId}`}>
                {i > 0 ? ', ' : ''}
                {u.courseTitle} › {u.itemTitle}
              </span>
            ))}
          </p>
        </div>
        <Button variant="secondary" onClick={onCopy}>
          Copy link <span className="sr-only">for {entry.label}</span>
        </Button>
      </Card>
    </li>
  );
}
