import { PDF_CONTENT_TYPE, shrinkPrompt } from '@gurukul/schema';
import type { Block, ShrinkTarget, UploadPolicy, UploadProblem } from '@gurukul/schema';
import { useToast } from '@gurukul/ui';
import { useEffect, useRef, useState } from 'react';
import { useUploadPolicy } from '../../data/useUploadPolicy';
import { log } from '../../log';
import { UploadCancelledError } from '../errors';
import { copyText } from '../media/clipboard';
import { pdfBlurHash } from '../media/blurHash';
import { uploadFailureMessage } from '../media/failure';
import { inspectImage } from '../media/inspect';
import { mediaPath, newMediaId, pdfMetadata } from '../media/path';
import { useStudio } from '../StudioProvider';
import { useBlockScope } from './BlockScope';

type FileBlock = Extract<Block, { type: 'file' }>;

/** A PDF that passed the check and waits for the Educator to upload it. */
export interface PickedPdf {
  file: File;
  /** An object URL of the file itself, so the preview link opens it before anything uploads. */
  previewUrl: string;
}

export type PdfStage =
  | { step: 'idle' }
  | { step: 'checking'; name: string }
  /**
   * Refused: nothing uploaded. `target` is what the agent prompt names (none for an image, which
   * a prompt cannot help); `suggestLink` is a PDF over the limit, which belongs on GitHub or Drive.
   */
  | {
      step: 'refused';
      problems: UploadProblem[];
      target: ShrinkTarget | null;
      suggestLink: boolean;
    }
  | { step: 'ready'; picked: PickedPdf; failure?: string }
  | { step: 'uploading'; picked: PickedPdf; progress: number };

export interface PdfUpload {
  stage: PdfStage;
  policy: UploadPolicy;
  pick: (file: File) => Promise<void>;
  /** Uploads the picked file; on success the block gets its address, `upload` and, if empty, a label. */
  upload: (picked: PickedPdf) => Promise<void>;
  cancel: () => void;
  copyPrompt: (target: ShrinkTarget) => Promise<void>;
}

/** The file name without its extension: the label a new upload starts with. */
export const labelFromName = (name: string) => name.replace(/\.[^.]*$/, '') || name;

/**
 * The File block's Upload tab state machine, the PDF twin of `useImageUpload`: pick, check (the
 * same `checkUpload` through `inspectImage`, which reads the first bytes and needs no pixels),
 * upload, cancel, retry. The draft changes only when an upload has finished.
 */
export function usePdfUpload(block: FileBlock, onChange: (block: FileBlock) => void): PdfUpload {
  const { courseId, uid } = useBlockScope();
  const { policy } = useUploadPolicy();
  const { storage } = useStudio();
  const toast = useToast();
  const [stage, setStage] = useState<PdfStage>({ step: 'idle' });
  // The block as it is when the upload ends: the Educator may have typed a label meanwhile.
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
    const target: ShrinkTarget = { kind: 'pdf', name: file.name, size: file.size };
    let result;
    try {
      // No pixels to read from a PDF: the decoder is told there are none.
      result = await inspectImage(file, policy, async () => null);
    } catch {
      setStage({
        step: 'refused',
        target,
        suggestLink: false,
        problems: [
          {
            code: 'signature',
            message: 'This file could not be read. Choose it again, or export it again.',
          },
        ],
      });
      return;
    }
    if (gone.current) return;
    const { check } = result;
    if (check.kind === 'image') {
      setStage({
        step: 'refused',
        target: null,
        suggestLink: false,
        problems: [
          { code: 'type', message: 'This is an image. Add an image with an Image block instead.' },
        ],
      });
    } else if (!check.ok) {
      setStage({
        step: 'refused',
        target,
        problems: check.problems,
        suggestLink: check.suggestLink,
      });
    } else {
      setStage({ step: 'ready', picked: { file, previewUrl: URL.createObjectURL(file) } });
    }
  };

  const upload = async (picked: PickedPdf) => {
    // A second click before the screen has caught up must not start a second upload.
    if (running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setStage({ step: 'uploading', picked, progress: 0 });
    const path = mediaPath(courseId, newMediaId(), PDF_CONTENT_TYPE);
    // Made while the file uploads; it never fails, so a placeholder cannot hold an upload back.
    const hashing = pdfBlurHash(picked.file);
    try {
      const url = await storage.upload({
        path,
        file: picked.file,
        metadata: pdfMetadata({ uid, courseId }),
        onProgress: (progress) =>
          setStage((now) => (now.step === 'uploading' ? { ...now, progress } : now)),
        signal: controller.signal,
      });
      const blurHash = await hashing;
      const now = latest.current;
      onChange({
        ...now,
        url,
        label: now.label || labelFromName(picked.file.name).slice(0, 120),
        upload: {
          path,
          bytes: picked.file.size,
          contentType: PDF_CONTENT_TYPE,
          name: picked.file.name.slice(0, 120),
          ...(blurHash ? { blurHash } : {}),
        },
      });
      setStage({ step: 'idle' });
      toast.show('The PDF is in the lesson. Learners see it once you publish.', {
        tone: 'success',
        title: 'PDF uploaded',
      });
    } catch (error) {
      if (error instanceof UploadCancelledError) {
        setStage({ step: 'ready', picked });
        return;
      }
      log.warn('PDF upload failed', { courseId, code: (error as { code?: unknown }).code });
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

  return { stage, policy, pick, upload, cancel: () => running.current?.abort(), copyPrompt };
}
