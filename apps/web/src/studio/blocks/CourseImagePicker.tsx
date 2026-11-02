import { formatBytes } from '@gurukul/schema';
import { Button, Dialog, EmptyState, ImageIcon, MediaGallery } from '@gurukul/ui';
import { useState } from 'react';
import type { CourseImage } from '../media/courseMedia';
import { useBlockScope } from './BlockScope';

const NONE: readonly CourseImage[] = [];

const facts = ({ upload, width, height }: CourseImage) =>
  [
    formatBytes(upload.bytes),
    width !== undefined && height !== undefined && `${width} × ${height} px`,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * "Choose from this course's media": a dialog of the images this course already hosts. Choosing one
 * points the block at the same file (no upload, no copy); alt text stays the Educator's to write.
 * Only this course's files are listed.
 */
export function CourseImagePicker({
  current,
  onChoose,
}: {
  /** The `upload.path` the block uses now, shown as chosen. */
  current: string | undefined;
  onChoose: (image: CourseImage) => void;
}) {
  const { uploadedImages = NONE } = useBlockScope();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <div className="studio-upload__actions">
        <Button variant="secondary" icon={<ImageIcon />} onClick={() => setOpen(true)}>
          {"Choose from this course's media"}
        </Button>
      </div>
      <Dialog
        open={open}
        size="lg"
        title="Choose from this course's media"
        onClose={close}
        footer={
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
        }
      >
        {uploadedImages.length === 0 ? (
          <EmptyState title="No uploaded images yet" headingAs="h3">
            Upload an image in any lesson of this course and it appears here, ready to reuse.
          </EmptyState>
        ) : (
          <>
            <p className="sc-help">
              Uploaded images in this course. Choosing one reuses the same file; write its alt text
              for this lesson.
            </p>
            <MediaGallery
              label="Uploaded images in this course"
              selectedId={current ?? null}
              items={uploadedImages.map((image) => ({
                id: image.upload.path,
                name: image.upload.name,
                meta: facts(image),
                kind: 'image',
                url: image.url,
              }))}
              onSelect={(item) => {
                onChoose(uploadedImages.find((i) => i.upload.path === item.id) as CourseImage);
                close();
              }}
            />
          </>
        )}
      </Dialog>
    </>
  );
}
