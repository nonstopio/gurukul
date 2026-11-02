import { formatBytes } from '@gurukul/schema';
import type { Block } from '@gurukul/schema';
import { Button, Callout, CopyIcon, FileDrop, UploadIcon, buttonClass } from '@gurukul/ui';
import { SHRINK_GUIDE_URL } from '../media/failure';
import type { ImageUpload } from './useImageUpload';

type ImageBlock = Extract<Block, { type: 'image' }>;

const px = (width: number, height: number) => `${width} × ${height} px`;

/**
 * The Image block's Upload tab: the no-personal-data notice, the file drop (rules first), what a
 * refused file got wrong, the preview's facts and the Upload button. What is on screen is
 * `source.stage`; the block changes only when an upload finishes (see `useImageUpload`).
 */
export function ImageUploadPanel({
  block,
  source,
  onRemove,
}: {
  block: ImageBlock;
  source: ImageUpload;
  onRemove: () => void;
}) {
  const { stage, policy } = source;
  const { image } = policy;
  const rules = `WebP, PNG or JPEG · up to ${formatBytes(image.maxBytes)} · ${image.recommendedLongEdge} px wide is ideal`;

  const failure = stage.step === 'ready' ? stage.failure : undefined;
  const refusal =
    stage.step === 'refused' ? (
      <>
        <p>
          <strong>This image cannot be uploaded as it is.</strong>
        </p>
        <ol className="studio-upload__steps">
          {stage.problems.map((problem) => (
            <li key={problem.code}>{problem.message}</li>
          ))}
        </ol>
        <div className="studio-upload__actions">
          <Button
            variant="secondary"
            icon={<CopyIcon />}
            onClick={() => void source.copyPrompt(stage.target)}
          >
            Copy a prompt for your coding agent
          </Button>
          <a
            className={buttonClass('ghost')}
            href={SHRINK_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            How to shrink it by hand
          </a>
        </div>
      </>
    ) : failure ? (
      <p>{failure}</p>
    ) : undefined;

  const dropState =
    stage.step === 'checking' || stage.step === 'uploading'
      ? stage.step
      : refusal
        ? 'error'
        : 'idle';
  const named = stage.step === 'checking' ? stage.name : undefined;

  return (
    <div className="studio-fields">
      <Callout tone="note" title="No personal data">
        Do not upload names, email addresses or faces of people who have not agreed, client names or
        internal NonStop process, or secrets such as tokens and keys. Crop or blur them out first.
      </Callout>
      {block.upload ? (
        <p className="studio-upload__facts">
          {`Uploaded: ${block.upload.name} · ${formatBytes(block.upload.bytes)}`}
          {block.width !== undefined && block.height !== undefined
            ? ` · ${px(block.width, block.height)}`
            : ''}
        </p>
      ) : null}
      <FileDrop
        label={block.upload ? 'Replace image' : 'Choose an image'}
        policy={rules}
        accept={image.contentTypes.join(',')}
        state={dropState}
        fileName={stage.step === 'uploading' ? stage.picked.file.name : named}
        progress={stage.step === 'uploading' ? stage.progress : 0}
        error={refusal}
        onFile={(file) => void source.pick(file)}
        onCancel={source.cancel}
      />
      {stage.step === 'ready' || stage.step === 'uploading' ? (
        <>
          {stage.picked.warnings.map((warning) => (
            <Callout key={warning} tone="warning" title="This image is narrow">
              {warning}
            </Callout>
          ))}
          <p className="studio-upload__facts">
            {`${stage.picked.file.name} · ${formatBytes(stage.picked.file.size)} · ${px(stage.picked.width, stage.picked.height)}`}
          </p>
          {stage.step === 'ready' ? (
            <div className="studio-upload__actions">
              <Button icon={<UploadIcon />} onClick={() => void source.upload(stage.picked)}>
                {failure ? 'Try again' : 'Upload image'}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
      {block.upload && stage.step === 'idle' ? (
        <div className="studio-upload__actions">
          <Button variant="danger-quiet" onClick={onRemove}>
            Remove image
          </Button>
        </div>
      ) : null}
    </div>
  );
}
