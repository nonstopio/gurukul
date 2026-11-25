import type { AuthoringSession } from '@gurukul/schema';
import { Button, Callout, Card, Chip, CourseTile, Pagination } from '@gurukul/ui';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useUser } from '../../auth/AuthProvider';
import { useAsync } from '../../data/useAsync';
import { useDesktop } from '../../desktop/bridge';
import { courseImageUrl } from '../../learn/model';
import { log } from '../../log';
import { pageFor } from '../../paging';
import { savedWhen } from './save';
import { createSessionStore, sessionPath } from './store';

/**
 * The desktop app's "Sessions in progress" on the Studio course list (`.plan/22-desktop-studio.md`,
 * Starting a session): every open session on this computer, newest change first, each opening its
 * workspace. A new course's session is the only place its work lives until Create course and save
 * draft, so without this list it can only be found through search. Reads local files, never
 * Firestore. Nothing is drawn while the list loads, when the app cannot answer yet (the session
 * buttons say why on a click), or when there is no open session: the section exists only when
 * there is something to carry on.
 */
export function OpenSessions() {
  const desktop = useDesktop();
  const { uid } = useUser();
  const store = useMemo(
    () =>
      desktop.status === 'ready' ? createSessionStore({ desktop: desktop.desktop, uid }) : null,
    [desktop, uid],
  );
  const result = useAsync(
    useCallback(async () => {
      if (!store) return [];
      try {
        return (await store.list()).sessions.filter((s) => s.status === 'open');
      } catch (error) {
        log.error('Session list failed', error);
        throw error;
      }
    }, [store]),
  );
  if (result.state === 'loading') return null;
  if (result.state === 'ready' && result.value.length === 0) return null;
  return (
    <Card title="Sessions in progress">
      {result.state === 'ready' ? (
        <SessionTiles sessions={result.value} />
      ) : (
        <Callout
          tone="warning"
          title="Your sessions on this computer could not be read"
          role="alert"
          mascot="error"
        >
          <p>Nothing was removed. Try again, or close Gurukul Studio and open it again.</p>
          <div className="load-actions">
            <Button variant="secondary" onClick={result.retry}>
              Try again
            </Button>
          </div>
        </Callout>
      )}
    </Card>
  );
}

function SessionTiles({ sessions }: { sessions: AuthoringSession[] }) {
  const [page, setPage] = useState(1);
  const paged = pageFor(sessions, page);
  const now = new Date();
  return (
    <>
      <p className="sc-new__hint">
        Kept on this computer. A new course reaches Gurukul when you choose Create course and save
        draft in its Review.
      </p>
      <ul className="sc-grid">
        {paged.rows.map((s) => (
          <SessionTile key={s.id} session={s} now={now} />
        ))}
      </ul>
      <Pagination
        label="Sessions in progress"
        page={paged.page}
        total={sessions.length}
        onPageChange={setPage}
      />
    </>
  );
}

function SessionTile({ session, now }: { session: AuthoringSession; now: Date }) {
  const course = session.work.course;
  const created = session.courseId !== null;
  const turns = session.turns.length;
  return (
    <CourseTile
      as="li"
      title={session.title}
      heading={<Link to={sessionPath(session.id)}>{session.title}</Link>}
      image={courseImageUrl(course)}
      theme={course.cover.theme}
      chips={
        created ? (
          <Chip tone="neutral">Editing</Chip>
        ) : (
          <Chip tone="warning">New course · not created yet</Chip>
        )
      }
      summary={
        created
          ? `Changes to ${course.title} reach its draft when you save them from Review.`
          : 'Only on this computer until you create the course from Review.'
      }
      meta={
        <span className="sc-facts">
          <span>{`${turns} ${turns === 1 ? 'turn' : 'turns'}`}</span>
          <span>{`Changed ${savedWhen(new Date(session.updatedAt), now) as string}`}</span>
        </span>
      }
    />
  );
}
