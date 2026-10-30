import {
  Button,
  Callout,
  Dialog,
  EmptyState,
  FilterBar,
  Input,
  MediaGallery,
  MediaPreview,
  Page,
  PageHeader,
  Select,
  buttonClass,
  mediaKindName,
  useToast,
} from '@gurukul/ui';
import type { MediaKind } from '@gurukul/ui';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useSession, useUser } from '../auth/AuthProvider';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { useStudio } from './StudioProvider';
import {
  collectMedia,
  courseCount,
  filterMedia,
  galleryKind,
  mediaName,
  usedText,
} from './studioModel';
import type { MediaEntry } from './studioModel';

const TYPES: MediaKind[] = ['image', 'video', 'pdf', 'audio', 'embed', 'file'];
const keyOf = (e: MediaEntry) => `${e.kind} ${e.url}`;

/**
 * `/studio/media`: a gallery of every link used in the courses the person can see, with a real
 * preview for images, search, a type filter and a detail drawer to copy the link. No uploads in v1.
 */
export function MediaPage() {
  const { data } = useStudio();
  const { uid } = useUser();
  const admin = useSession().roles.includes('admin');
  const toast = useToast();
  const t = useTerms();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<MediaKind | 'all'>('all');
  const [open, setOpen] = useState<MediaEntry | null>(null);
  const result = useAsync(
    useCallback(
      () => data.listCourses(uid, admin).then((rows) => collectMedia(rows)),
      [data, uid, admin],
    ),
  );

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.show('Link copied', { tone: 'success' });
    } catch {
      log.warn('Copying a link failed');
      toast.show('Could not copy the link. Select it and copy by hand.', { tone: 'danger' });
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow={t.Studio}
        title="Media library"
        lead="Every video, image, PDF and embed your courses link to, so you can reuse it."
      />
      <Callout tone="note" title="Links only, for now">
        <p>
          Gurukul does not store uploads yet, so there is nothing to drop here. Add a link in a
          lesson and it appears in this library.
        </p>
      </Callout>
      <Loaded loadable={result}>
        {(entries) => {
          if (entries.length === 0) {
            return (
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
            );
          }
          const present = TYPES.filter((k) => entries.some((e) => galleryKind(e) === k));
          const found = filterMedia(entries, search, type);
          return (
            <>
              <FilterBar
                label="Filter media"
                count={`${found.length} of ${entries.length}`}
                canClear={search !== '' || type !== 'all'}
                onClear={() => {
                  setSearch('');
                  setType('all');
                }}
              >
                <Input
                  label="Search media"
                  hideLabel
                  type="search"
                  placeholder="Search by name, link or course"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Select
                  label="Type"
                  hideLabel
                  value={type}
                  onChange={(e) => setType(e.target.value as MediaKind | 'all')}
                >
                  <option value="all">All types</option>
                  {present.map((k) => (
                    <option key={k} value={k}>
                      {mediaKindName(k)}
                    </option>
                  ))}
                </Select>
              </FilterBar>
              {found.length === 0 ? (
                <EmptyState headingAs="h2" title="No media matches">
                  Clear the search or pick another type.
                </EmptyState>
              ) : (
                <MediaGallery
                  label="Media"
                  selectedId={open ? keyOf(open) : null}
                  items={found.map((e) => ({
                    id: keyOf(e),
                    name: mediaName(e),
                    meta: `${mediaKindName(galleryKind(e))} · ${usedText(e)}`,
                    kind: galleryKind(e),
                    url: e.url,
                  }))}
                  onSelect={(item) =>
                    setOpen(found.find((e) => keyOf(e) === item.id) as MediaEntry)
                  }
                />
              )}
            </>
          );
        }}
      </Loaded>
      {open ? <Detail entry={open} onClose={() => setOpen(null)} onCopy={copy} /> : null}
    </Page>
  );
}

function Detail({
  entry,
  onClose,
  onCopy,
}: {
  entry: MediaEntry;
  onClose: () => void;
  onCopy: (url: string) => Promise<void>;
}) {
  const kind = galleryKind(entry);
  const n = courseCount(entry);
  return (
    <Dialog
      open
      size="drawer"
      title={mediaName(entry)}
      onClose={onClose}
      footer={
        <Button onClick={() => void onCopy(entry.url)}>
          Copy link <span className="sr-only">for {mediaName(entry)}</span>
        </Button>
      }
    >
      <div className="sc-media__detail">
        <MediaPreview kind={kind} url={entry.url} size="large" />
        <p className="sc-help">
          {mediaKindName(kind)} · used in {n} {n === 1 ? 'course' : 'courses'}
        </p>
        <p className="sc-media__url">{entry.url}</p>
        <ul className="sc-media__uses" aria-label="Where it is used">
          {entry.usedIn.map((u) => (
            <li key={`${u.courseId}-${u.itemId}`}>
              <Link to={`/studio/courses/${u.courseId}/lessons/${u.itemId}`}>
                {u.courseTitle} › {u.itemTitle}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
