import type { CourseListing } from '@gurukul/schema';
import { Select } from '@gurukul/ui';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { useSession, useUser } from '../auth/AuthProvider';
import { useLearnerData } from '../data/DataProvider';
import { useAsync } from '../data/useAsync';
import { useStudio } from './StudioProvider';
import { canEdit } from './studioModel';
import type { StudioCourse } from './types';

export interface PickedCourse {
  /** Every course, as the Studio list has them: summaries only. */
  courses: CourseListing[];
  /** The course in hand: `?course=`, else the first the person may edit, else the first; '' with no courses. */
  courseId: string;
  /** That one course's working copy, as a list of one (none when it cannot be read). */
  rows: StudioCourse[];
}

/**
 * One course at a time for the Studio pages that look inside courses (Media, Question bank). They
 * used to read every course and every draft to draw one screen; now the list is summaries and only
 * the picked course is read: its draft when the person may edit it, else the published course.
 */
export function useStudioCourse() {
  const { data } = useStudio();
  const learner = useLearnerData();
  const { uid } = useUser();
  const admin = useSession().roles.includes('admin');
  const [params, setParams] = useSearchParams();
  const asked = params.get('course');
  const picked = useAsync(
    useCallback(async (): Promise<PickedCourse> => {
      const courses = await data.listLiveCourses();
      const course =
        courses.find((c) => c.id === asked) ??
        courses.find((c) => canEdit(c, uid, admin)) ??
        courses[0];
      if (!course) return { courses, courseId: '', rows: [] };
      const draft = canEdit(course, uid, admin) ? await data.getDraft(course.id) : null;
      const live = draft ? draft.course : await learner.getCourse(course.id);
      return { courses, courseId: course.id, rows: live ? [{ live, draft }] : [] };
    }, [data, learner, uid, admin, asked]),
  );
  const pick = (courseId: string) => {
    const next = new URLSearchParams(params);
    next.set('course', courseId);
    setParams(next, { replace: true });
  };
  return { picked, pick };
}

/** The course a page looks inside, as a dropdown of every course. */
export function CoursePicker({
  picked,
  onPick,
  label = 'Course',
}: {
  /** The dropdown's accessible name. */
  label?: string;
  picked: PickedCourse;
  onPick: (courseId: string) => void;
}) {
  return (
    <Select
      label={label}
      hideLabel
      value={picked.courseId}
      onChange={(e) => onPick(e.target.value)}
    >
      {picked.courses.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title}
        </option>
      ))}
    </Select>
  );
}
