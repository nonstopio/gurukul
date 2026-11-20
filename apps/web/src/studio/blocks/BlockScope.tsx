import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { CourseImage } from '../media/courseMedia';

/** Who is editing which course: what an upload needs to name and label its file. */
export interface BlockScopeValue {
  courseId: string;
  uid: string;
  /** Images this course's draft already hosts, for "Choose from this course's media". */
  uploadedImages?: readonly CourseImage[] | undefined;
  /**
   * Why nothing may be uploaded here, shown in place of the Upload tab's picker: a new course in a
   * desktop session has no course to store files under until its first save. Undefined: uploads work.
   */
  uploadsOff?: string | undefined;
}

const Ctx = createContext<BlockScopeValue | null>(null);

export function BlockScope({
  courseId,
  uid,
  uploadedImages,
  uploadsOff,
  children,
}: BlockScopeValue & { children: ReactNode }) {
  return (
    <Ctx.Provider value={{ courseId, uid, uploadedImages, uploadsOff }}>{children}</Ctx.Provider>
  );
}

/** The course and person a block editor works for. Throws outside `BlockScope`: a missing provider is a bug. */
export function useBlockScope(): BlockScopeValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useBlockScope must be used inside <BlockScope>');
  return value;
}
