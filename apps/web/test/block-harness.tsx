import { ToastProvider } from '@gurukul/ui';
import type { ReactNode } from 'react';
import { DataProvider } from '../src/data/DataProvider';
import type { CourseImage } from '../src/studio/media/courseMedia';
import { BlockScope } from '../src/studio/blocks/BlockScope';
import { StudioProvider } from '../src/studio/StudioProvider';
import { fakeData } from './fake-data';
import { fakeStudio } from './fake-studio';

/**
 * What a block editor needs around it, as the lesson editor page provides it: toasts, the data
 * port (upload limits), Studio (Cloud Storage) and the course and person it works for.
 */
export function BlockProviders({
  children,
  studio = fakeStudio(),
  data = fakeData(),
  courseId = 'git',
  uid = 'u1',
  uploadedImages,
}: {
  children: ReactNode;
  studio?: ReturnType<typeof fakeStudio>;
  data?: ReturnType<typeof fakeData>;
  courseId?: string;
  uid?: string;
  uploadedImages?: readonly CourseImage[] | undefined;
}) {
  return (
    <ToastProvider>
      <DataProvider data={data.data}>
        <StudioProvider {...studio}>
          <BlockScope courseId={courseId} uid={uid} uploadedImages={uploadedImages}>
            {children}
          </BlockScope>
        </StudioProvider>
      </DataProvider>
    </ToastProvider>
  );
}
