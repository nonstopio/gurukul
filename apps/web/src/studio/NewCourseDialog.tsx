import { Button, ColourSwatch, Dialog, Callout, Select } from '@gurukul/ui';
import type { CoverTheme } from '@gurukul/ui';
import type { Course } from '@gurukul/schema';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAnalytics } from '../analytics/react/context';
import { userMessageOf } from '../api';
import { log } from '../log';
import { CourseAddressFields, isAddressTaken, useCourseAddress } from './CourseAddress';
import { useStudio } from './StudioProvider';
const LEVELS: Array<{ value: Course['level']; label: string }> = [
  { value: 'foundation', label: 'Foundation' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

/** The "New course" dialog: a title, an address derived from it, a level and a cover; blank or copied. */
export function NewCourseDialog({
  open,
  onClose,
  editable,
}: {
  open: boolean;
  onClose: () => void;
  /** The courses the person may edit, offered under "Duplicate from". */
  editable: Array<Pick<Course, 'id' | 'title'>>;
}) {
  return open ? <Form onClose={onClose} editable={editable} /> : null;
}

function Form({
  onClose,
  editable,
}: {
  onClose: () => void;
  editable: Array<Pick<Course, 'id' | 'title'>>;
}) {
  const { service } = useStudio();
  const navigate = useNavigate();
  const analytics = useAnalytics();
  const address = useCourseAddress();
  const [level, setLevel] = useState<Course['level']>('foundation');
  const [theme, setTheme] = useState<CoverTheme>('forest');
  const [source, setSource] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = address.valid && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setProblem(null);
    try {
      const { courseId } = await service.createCourse({
        title: address.title.trim(),
        slug: address.slug,
        level,
        theme,
        duplicateFrom: source || null,
      });
      analytics.track('course_create', { course_id: courseId });
      onClose();
      void navigate(`/studio/courses/${courseId}`);
    } catch (error) {
      if (isAddressTaken(error)) address.markTaken();
      else {
        log.error('Creating a course failed', error);
        setProblem(userMessageOf(error, 'Could not create the course. Try again.'));
      }
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="New course"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-course-form" disabled={!ready} loading={busy}>
            Create course
          </Button>
        </>
      }
    >
      <form id="new-course-form" className="sc-form" onSubmit={(e) => void submit(e)}>
        {problem ? (
          <Callout tone="warning" title="The course was not created" role="alert" mascot="error">
            <p>{problem}</p>
          </Callout>
        ) : null}
        <CourseAddressFields address={address} />
        <Select
          label="Level"
          value={level}
          onChange={(e) => setLevel(e.target.value as Course['level'])}
        >
          {LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </Select>
        <ColourSwatch label="Cover theme" value={theme} onChange={setTheme} />
        <Select label="Duplicate from" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Start blank</option>
          {editable.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
      </form>
    </Dialog>
  );
}
