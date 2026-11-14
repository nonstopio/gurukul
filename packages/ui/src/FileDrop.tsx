import { useId, useRef, useState } from 'react';
import type { ClipboardEvent, DragEvent, ReactNode } from 'react';
import { Button } from './Button';
import { cx } from './cx';
import { UploadIcon } from './Icon';
import { Mascot } from './Mascot';
import { ProgressBar } from './ProgressBar';
import './file-drop.css';

export type FileDropState = 'idle' | 'checking' | 'error' | 'uploading';

export interface FileDropProps {
  /** The button's verb and object, e.g. "Choose an image" or "Replace image". */
  label: string;
  /** The rules, said before anyone picks: "WebP, PNG or JPEG · up to 500 KB · 1600 px wide is ideal". */
  policy: ReactNode;
  /** What the control is doing. `error` shows `error` under the zone; `dragging` is the control's own. Default: `idle`. */
  state?: FileDropState | undefined;
  /** The picked file's name, named in the checking and uploading states. */
  fileName?: string | undefined;
  /** Percent uploaded, 0 to 100, in the `uploading` state. */
  progress?: number | undefined;
  /** Why the file was refused, and what to do. Tied to the zone with `aria-describedby`. */
  error?: ReactNode | undefined;
  /** A `File.type` list for the native picker, e.g. `image/webp,image/png,image/jpeg`. */
  accept?: string | undefined;
  /** Called with the file that was chosen, dropped or pasted. Only the first of several is used. */
  onFile: (file: File) => void;
  /** Stops an upload. The Cancel button shows only while `uploading` and this is given. */
  onCancel?: (() => void) | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

/** Progress is spoken in tens, so a screen reader is told "40%" and not every percent. */
const spoken = (percent: number) => Math.floor(Math.min(100, Math.max(0, percent)) / 10) * 10;

/**
 * Pick a file by button, by dropping it on the button, or by pasting it while the button is
 * focused. The drop zone is a real `<button>`, so the keyboard and screen readers get the native
 * picker; the policy line and any error are tied to it with `aria-describedby`. Checking and
 * uploading replace the zone with a status line (`aria-live`), a progress bar and Cancel.
 */
export function FileDrop({
  label,
  policy,
  state = 'idle',
  fileName,
  progress = 0,
  error,
  accept,
  onFile,
  onCancel,
  disabled = false,
  className,
}: FileDropProps) {
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const busy = state === 'checking' || state === 'uploading';
  const open = !busy && !disabled;

  const take = (files: FileList | null | undefined) => {
    const file = files?.[0];
    if (file && open) onFile(file);
  };
  const stop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    take(event.dataTransfer.files);
  };
  const onPaste = (event: ClipboardEvent) => {
    const files = event.clipboardData.files;
    if (open && files.length > 0) {
      event.preventDefault();
      take(files);
    }
  };

  const policyId = `${uid}-policy`;
  const errorId = `${uid}-error`;
  const hasError = state === 'error' && Boolean(error);
  return (
    <div className={cx('g-filedrop', className)} onPaste={onPaste}>
      {busy ? (
        <div className="g-filedrop__busy">
          <p className="g-filedrop__status" role="status">
            {state === 'checking'
              ? `Checking ${fileName ?? 'the file'}…`
              : `Uploading ${fileName ?? 'the file'}: ${spoken(progress)}%`}
          </p>
          {state === 'uploading' ? (
            <>
              <ProgressBar value={progress} label="Upload progress" />
              {onCancel ? (
                <Button variant="secondary" onClick={onCancel}>
                  Cancel upload
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className={cx('g-filedrop__zone', dragging && 'g-filedrop__zone--dragging')}
          disabled={disabled}
          aria-describedby={cx(policyId, hasError && errorId)}
          onClick={() => input.current?.click()}
          onDragEnter={stop}
          onDragOver={stop}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <UploadIcon className="g-filedrop__icon" size={24} />
          <span className="g-filedrop__label">{dragging ? 'Drop to check it' : label}</span>
          <span className="g-filedrop__hint">Drag a file here, paste one, or choose it.</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        hidden
        aria-label={`${label}: file picker`}
        accept={accept}
        onChange={(event) => {
          take(event.target.files);
          // The same file picked again must still count as a change.
          event.target.value = '';
        }}
      />
      <p className="g-filedrop__policy" id={policyId}>
        {policy}
      </p>
      {hasError ? (
        <div className="g-filedrop__error" id={errorId} role="alert">
          <Mascot state="validation" variant="face" size={32} />
          <div className="g-filedrop__error-text">{error}</div>
        </div>
      ) : null}
    </div>
  );
}
