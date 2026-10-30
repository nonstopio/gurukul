import type { Course } from '@gurukul/schema';
import { Chip, CourseTile } from '@gurukul/ui';
import type { ReactNode } from 'react';
import { countItems, courseImageUrl } from '../learn/model';

/** A course as a choice in a grid: the catalogue's tile, with a tick that pops in when picked. */
export function CourseChoice({
  course,
  selected,
  onChange,
  note,
  label,
}: {
  course: Course;
  selected: boolean;
  onChange: (next: boolean) => void;
  /** A status word shown as a chip, e.g. "Draft". */
  note?: ReactNode;
  /** The checkbox's accessible name. Default: the course title. */
  label?: string;
}) {
  const lessons = countItems(course).lessons;
  return (
    <CourseTile
      as="li"
      title={course.title}
      image={courseImageUrl(course)}
      theme={course.cover.theme}
      chips={note ? <Chip tone="neutral">{note}</Chip> : undefined}
      meta={`${lessons} ${lessons === 1 ? 'lesson' : 'lessons'} · ${course.estimatedMinutes} min`}
      selectLabel={label}
      selected={selected}
      onSelectedChange={onChange}
    />
  );
}
