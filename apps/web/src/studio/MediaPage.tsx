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
  Pagination,
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
import { pageFor } from '../paging';
import { useStudio } from './StudioProvider';
import {
  UPLOADED,
  collectMedia,
  courseCount,
  filterMedia,
  galleryKind,
  mediaName,
  uploadedText,
  usedText,
} from './studioModel';
import type { MediaEntry } from './studioModel';

const TYPES: MediaKind[] = ['image', 'video', 'pdf', 'audio', 'embed', 'file'];
const keyOf = (e: MediaEntry) => `${e.kind} ${e.url}`;

/**
 * `/studio/media`: a gallery of every link used in the courses the person can see, with a real
 * preview for images, search, a type filter (with Uploaded for files Gurukul hosts, and their size) and a detail drawer to copy the link.
 */
export function MediaPage() {
  const { data } = useStudio();
  const { uid } = useUser();
  const admin = useSession().roles.includes('admin');
  const toast = useToast();
  const t = useTerms();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<MediaKind | 'all' | typeof UPLOADED>('all');
  const [open, setOpen] = useState<MediaEntry | null>(null);
  const [page, setPage] = useState(1);
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
      <Callout tone="note" title="Add media in a lesson">
        <p>
          Upload an image or add a link in a lesson and it appears here. Files you uploaded are
          tagged Uploaded; pick the Uploaded type to see only those.
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
          const paged = pageFor(found, page);
          return (
            <>
              <FilterBar
                label="Filter media"
                count={`${found.length} of ${entries.length}`}
                canClear={search !== '' || type !== 'all'}
                onClear={() => {
                  setSearch('');
                  setType('all');
                  setPage(1);
                }}
              >
                <Input
                  label="Search media"
                  hideLabel
                  type="search"
                  placeholder="Search by name, link or course"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
                <Select
                  label="Type"
                  hideLabel
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value as MediaKind | 'all' | typeof UPLOADED);
                    setPage(1);
                  }}
                >
                  <option value="all">All types</option>
                  {entries.some((e) => e.upload) ? (
                    <option value={UPLOADED}>Uploaded</option>
                  ) : null}
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
                <>
                  <MediaGallery
                    label="Media"
                    selectedId={open ? keyOf(open) : null}
                    items={paged.rows.map((e) => ({
                      id: keyOf(e),
                      name: mediaName(e),
                      meta: `${mediaKindName(galleryKind(e))} · ${uploadedText(e)}${usedText(e)}`,
                      kind: galleryKind(e),
                      url: e.url,
                    }))}
                    onSelect={(item) =>
                      setOpen(found.find((e) => keyOf(e) === item.id) as MediaEntry)
                    }
                  />
                  <Pagination
                    label="Media"
                    page={paged.page}
                    total={found.length}
                    onPageChange={setPage}
                  />
                </>
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
          {mediaKindName(kind)} · {uploadedText(entry)}used in {n} {n === 1 ? 'course' : 'courses'}
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
