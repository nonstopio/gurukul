import { Input } from '@gurukul/ui';
import { slugify } from '@gurukul/schema';
import { useState } from 'react';
import { ApiClientError } from '../api';

/*
 * A new course's title and address, as Studio's New course dialog asks for them and as a Desktop
 * Studio session asks at its first save (`.plan/22-desktop-studio.md`, Save to draft): the address
 * is suggested from the title until typed, checked as the schema's `slug`, said to be taken when
 * `createCourse` answers so, and never changes once the course exists.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `createCourse` refused the address because a course already has it. */
export const isAddressTaken = (error: unknown): boolean =>
  error instanceof ApiClientError && error.code === 'CRS_1002';

export interface CourseAddress {
  title: string;
  /** The address: as typed, else suggested from the title. */
  slug: string;
  /** Both can be sent to `createCourse` (a taken address is known only once it answers). */
  valid: boolean;
  setTitle(title: string): void;
  setSlug(slug: string): void;
  /** `createCourse` said the address is taken: shown on the field until the title or address changes. */
  markTaken(): void;
  slugError: string | undefined;
}

export function useCourseAddress(initialTitle = ''): CourseAddress {
  const [title, setTitleNow] = useState(initialTitle);
  const [typed, setTyped] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);
  const slug = typed ?? slugify(title);
  return {
    title,
    slug,
    valid: title.trim() !== '' && SLUG.test(slug),
    setTitle(next) {
      setTitleNow(next);
      setTaken(false);
    },
    setSlug(next) {
      setTyped(next);
      setTaken(false);
    },
    markTaken: () => setTaken(true),
    slugError: taken
      ? 'That address is taken'
      : slug !== '' && !SLUG.test(slug)
        ? 'Use lower-case letters, digits and single hyphens.'
        : undefined,
  };
}

/** The Title and Address fields, with the warning that the address cannot change later. */
export function CourseAddressFields({
  address,
  disabled = false,
}: {
  address: CourseAddress;
  disabled?: boolean;
}) {
  return (
    <>
      <Input
        label="Title"
        value={address.title}
        maxLength={160}
        disabled={disabled}
        onChange={(e) => address.setTitle(e.target.value)}
      />
      <Input
        label="Address"
        hint="Used in links, and it cannot change later."
        value={address.slug}
        maxLength={80}
        spellCheck={false}
        disabled={disabled}
        error={address.slugError}
        onChange={(e) => address.setSlug(e.target.value)}
      />
    </>
  );
}
