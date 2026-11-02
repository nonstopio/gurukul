import { formatBytes, shrinkPrompt } from '@gurukul/schema';
import type {
  Block,
  ImageContentType,
  ShrinkTarget,
  UploadPolicy,
  UploadProblem,
} from '@gurukul/schema';
import { useToast } from '@gurukul/ui';
import { useEffect, useRef, useState } from 'react';
import { useUploadPolicy } from '../../data/useUploadPolicy';
import { log } from '../../log';
import { UploadCancelledError } from '../errors';
import { copyText } from '../media/clipboard';
import { imageBlurHash } from '../media/blurHash';
import { uploadFailureMessage } from '../media/failure';
import { inspectImage } from '../media/inspect';
import { imageMetadata, mediaPath, newMediaId } from '../media/path';
import { isShrinkable, shrinkImage } from '../media/shrink';
import { useStudio } from '../StudioProvider';
import { useBlockScope } from './BlockScope';

type ImageBlock = Extract<Block, { type: 'image' }>;

/** A file that passed the check and waits for the Educator to upload it. */
export interface PickedImage {
  file: File;
  /** An object URL of the file itself: the preview needs no upload. */
  previewUrl: string;
  width: number;
  height: number;
  warnings: string[];
  /** Set when this file is the browser's re-encode of a bigger one: what that one was. */
  shrunkFrom?: { bytes: number; width: number; height: number };
}

export type UploadStage =
  | { step: 'idle' }
  | { step: 'checking'; name: string }
  /** Refused: nothing uploaded, nothing kept. `target` is what the agent prompt names. */
  | {
      step: 'refused';
      problems: UploadProblem[];
      target: ShrinkTarget;
      /** The picked file and its pixels, only when it is a real image just too big or too wide. */
      shrinkable?: { file: File; width: number; height: number };
      /** Why Shrink it for me did not work, in words. */
      shrinkFailure?: string;
    }
  | { step: 'shrinking'; name: string }
  /** Passed. After a failed or cancelled try it is `ready` again, with `failure` in words for a failure. */
  | { step: 'ready'; picked: PickedImage; failure?: string }
  | { step: 'uploading'; picked: PickedImage; progress: number };

/** The refused stage, which carries what Shrink it for me needs. */
export type RefusedStage = Extract<UploadStage, { step: 'refused' }>;

export interface ImageUpload {
  stage: UploadStage;
  policy: UploadPolicy;
  /** Checks the file, then waits for `upload`; a refused file shows why. */
  pick: (file: File) => Promise<void>;
  /** Uploads the picked file; on success the block gets its address, size and `upload`. */
  upload: (picked: PickedImage) => Promise<void>;
  cancel: () => void;
  /** Re-encodes a refused, shrinkable image as WebP in the browser; the result waits for Upload. */
  shrink: (
    shrinkable: NonNullable<RefusedStage['shrinkable']>,
    refused: RefusedStage,
  ) => Promise<void>;
  /** Drops the shrunk file; nothing was uploaded. */
  discard: () => void;
  copyPrompt: (target: ShrinkTarget) => Promise<void>;
  /** The picked file's preview address while one waits or uploads. */
  previewUrl: string | undefined;
}

/**
 * The Upload tab's state machine: pick, check, preview, upload, cancel, retry. The draft changes
 * only when an upload has finished: a refused, cancelled or failed one writes nothing.
 */
export function useImageUpload(
  block: ImageBlock,
  onChange: (block: ImageBlock) => void,
): ImageUpload {
  const { courseId, uid } = useBlockScope();
  const { policy } = useUploadPolicy();
  const { storage } = useStudio();
  const toast = useToast();
  const [stage, setStage] = useState<UploadStage>({ step: 'idle' });
  // The block as it is when the upload ends, not as it was when it began: the Educator may have
  // typed alt text meanwhile.
  const latest = useRef(block);
  useEffect(() => {
    latest.current = block;
  });
  const running = useRef<AbortController | null>(null);
  const gone = useRef(false);
  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
      running.current?.abort();
    };
  }, []);

  const previewUrl =
    stage.step === 'ready' || stage.step === 'uploading' ? stage.picked.previewUrl : undefined;
  useEffect(() => {
    if (previewUrl === undefined) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const pick = async (file: File) => {
    setStage({ step: 'checking', name: file.name });
    const target: ShrinkTarget = { kind: 'image', name: file.name, size: file.size };
    let result;
    try {
      result = await inspectImage(file, policy);
    } catch {
      setStage({
        step: 'refused',
        target,
        problems: [
          {
            code: 'signature',
            message: 'This file could not be read. Choose it again, or export it again.',
          },
        ],
      });
      return;
    }
    // The drop zone takes no file while one is being checked, so only leaving can interrupt.
    if (gone.current) return;
    const { candidate, check } = result;
    const { width, height } = candidate;
    const sized =
      width === undefined || height === undefined ? target : { ...target, width, height };
    if (check.ok && check.kind !== 'image') {
      setStage({
        step: 'refused',
        target: sized,
        problems: [
          { code: 'type', message: 'This is a PDF. Add a PDF with a File block instead.' },
        ],
      });
    } else if (!check.ok || width === undefined || height === undefined) {
      setStage({
        step: 'refused',
        target: sized,
        problems: check.problems,
        ...(isShrinkable(check) && width !== undefined && height !== undefined
          ? { shrinkable: { file, width, height } }
          : {}),
      });
    } else {
      setStage({
        step: 'ready',
        picked: {
          file,
          previewUrl: URL.createObjectURL(file),
          width,
          height,
          warnings: check.warnings,
        },
      });
    }
  };

  const shrink = async (
    { file, width, height }: NonNullable<RefusedStage['shrinkable']>,
    { target, problems }: RefusedStage,
  ) => {
    setStage({ step: 'shrinking', name: file.name });
    const result = await shrinkImage(file, { width, height }, policy);
    if (gone.current) return;
    if (result.ok) {
      setStage({
        step: 'ready',
        picked: {
          file: result.file,
          previewUrl: URL.createObjectURL(result.file),
          width: result.width,
          height: result.height,
          warnings: result.check.warnings,
          shrunkFrom: { bytes: file.size, width, height },
        },
      });
      return;
    }
    setStage({
      step: 'refused',
      target,
      problems,
      shrinkFailure:
        result.reason === 'unsupported'
          ? 'This browser could not shrink the image. Copy the prompt for your coding agent, or shrink it by hand.'
          : `This image will not get under ${formatBytes(policy.image.maxBytes)} even when made smaller. Copy the prompt for your coding agent, or crop it first.`,
    });
  };

  const upload = async (picked: PickedImage) => {
    // A second click before the screen has caught up must not start a second upload.
    if (running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setStage({ step: 'uploading', picked, progress: 0 });
    const contentType = picked.file.type as ImageContentType;
    const path = mediaPath(courseId, newMediaId(), contentType);
    // Made while the file uploads; it never fails, so a placeholder cannot hold an upload back.
    const hashing = imageBlurHash(picked.file);
    try {
      const url = await storage.upload({
        path,
        file: picked.file,
        metadata: imageMetadata({
          contentType,
          uid,
          courseId,
          width: picked.width,
          height: picked.height,
        }),
        onProgress: (progress) =>
          setStage((now) => (now.step === 'uploading' ? { ...now, progress } : now)),
        signal: controller.signal,
      });
      const blurHash = await hashing;
      onChange({
        ...latest.current,
        url,
        width: picked.width,
        height: picked.height,
        upload: {
          path,
          bytes: picked.file.size,
          contentType,
          name: picked.file.name.slice(0, 120),
          ...(blurHash ? { blurHash } : {}),
        },
      });
      setStage({ step: 'idle' });
      toast.show('The image is in the lesson. Learners see it once you publish.', {
        tone: 'success',
        title: 'Image uploaded',
      });
    } catch (error) {
      if (error instanceof UploadCancelledError) {
        setStage({ step: 'ready', picked });
        return;
      }
      log.warn('Image upload failed', { courseId, code: (error as { code?: unknown }).code });
      setStage({ step: 'ready', picked, failure: uploadFailureMessage(error) });
    } finally {
      running.current = null;
    }
  };

  const copyPrompt = async (target: ShrinkTarget) => {
    const copied = await copyText(shrinkPrompt(policy, target));
    if (copied) {
      toast.show('Paste it into your coding agent and it will shrink the file for you.', {
        tone: 'success',
        title: 'Prompt copied',
      });
    } else {
      toast.show('Your browser did not allow copying. Try again, or shrink the file by hand.', {
        tone: 'warning',
        title: 'Could not copy the prompt',
      });
    }
  };

  return {
    stage,
    policy,
    pick,
    upload,
    cancel: () => running.current?.abort(),
    shrink,
    discard: () => setStage({ step: 'idle' }),
    copyPrompt,
    previewUrl,
  };
}
