import { Button, Card, useToast } from '@gurukul/ui';
import type { CourseAccess } from '@gurukul/schema';
import { useCallback, useState } from 'react';
import { useLearnerData } from '../data/DataProvider';
import { useAsync } from '../data/useAsync';
import { toastError } from '../errors';
import { Loaded } from '../learn/ui';
import { log } from '../log';
import { useStudio } from './StudioProvider';
import { VisibilityPicker } from './VisibilityPicker';

const sameAccess = (a: CourseAccess, b: CourseAccess): boolean =>
  a.visibility === b.visibility &&
  [...a.visibleTeamIds].sort().join('\n') === [...b.visibleTeamIds].sort().join('\n');

/**
 * Who can open the course, set on its own: saved through `setCourseAccess`, it applies to the
 * live course at once without a new version (a course never published keeps it for its first
 * publish). One read of the course document and one of `config/org` when it opens.
 */
export function AccessCard({ courseId, published }: { courseId: string; published: boolean }) {
  const { data } = useStudio();
  const learner = useLearnerData();
  const loadable = useAsync(
    useCallback(
      () =>
        Promise.all([
          data.getAccess(courseId),
          // Without the team list the other choices still work; a team pick then says where teams are made.
          learner.orgTeams().catch(() => {
            log.warn('Reading the team list failed', { courseId });
            return [] as string[];
          }),
        ]),
      [data, learner, courseId],
    ),
  );
  return (
    <Card title="Who can open this course" className="sc-panel">
      <Loaded loadable={loadable} skeleton={1}>
        {([access, teams]) => (
          <AccessForm courseId={courseId} initial={access} teams={teams} published={published} />
        )}
      </Loaded>
    </Card>
  );
}

function AccessForm({
  courseId,
  initial,
  teams,
  published,
}: {
  courseId: string;
  initial: CourseAccess;
  teams: string[];
  published: boolean;
}) {
  const { service } = useStudio();
  const toast = useToast();
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const needsTeam = value.visibility === 'teams' && value.visibleTeamIds.length === 0;

  const save = async () => {
    setBusy(true);
    const sent = value;
    try {
      const next = await service.setCourseAccess({ courseId, ...sent });
      setSaved(next);
      // A choice changed while the save was on its way is newer: keep it, still unsaved.
      setValue((now) => (now === sent ? next : now));
      toast.show(
        published
          ? 'Saved. It applies to the live course now.'
          : 'Saved. It applies when the course is first published.',
        { tone: 'success' },
      );
    } catch (e) {
      log.error('Changing who can open a course failed', e, { courseId });
      toastError(toast, e, "Couldn't change who can open the course. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="sc-help">
        {published
          ? 'Saving applies to the live course at once, without publishing a new version.'
          : 'Saved now, it takes effect when the course is first published.'}
      </p>
      <VisibilityPicker value={value} teams={teams} onChange={setValue} />
      {needsTeam ? (
        <p className="sc-help" role="alert">
          Pick at least one team, or choose another visibility.
        </p>
      ) : null}
      <div>
        <Button
          variant="secondary"
          disabled={needsTeam || sameAccess(value, saved)}
          loading={busy}
          onClick={() => void save()}
        >
          Save who can open
        </Button>
      </div>
    </>
  );
}
