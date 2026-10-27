import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '../auth/AuthProvider';
import { log } from '../log';
import { DraftConflictError } from './errors';
import { useStudio } from './StudioProvider';
import type { DraftDoc, Working } from './types';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

/** Milliseconds after the last edit before autosave fires. */
export const AUTOSAVE_MS = 1000;

export interface DraftApi {
  status: 'loading' | 'ready' | 'missing' | 'error';
  /** The working copy, or null until loaded. */
  work: Working | null;
  rev: number;
  save: SaveState;
  /** Applies an edit to the working copy and schedules an autosave. */
  update(edit: (work: Working) => Working): void;
  /** Saves now (used by the Save button, Publish and when leaving). */
  saveNow(): Promise<boolean>;
  /** Throws away local edits and loads the stored draft (the answer to a conflict). */
  reload(): void;
}

/**
 * Saves still on their way to the server, by course. A page that unmounts flushes its edits and
 * the next editor page loads the draft straight away; it waits here so it never reads the draft
 * from before the save landed.
 */
const inflight = new Map<string, Promise<unknown>>();

/**
 * The editing session for one course's draft: loads it, applies edits locally, autosaves a second
 * after the last one with an optimistic `rev` check, flushes when the page closes, and warns the
 * browser if edits are unsaved. Every Studio editor page uses it, so they all behave the same.
 */
export function useDraft(courseId: string): DraftApi {
  const { data } = useStudio();
  const uid = useUser().uid;
  const [loaded, setLoaded] = useState<{
    key: string;
    status: 'ready' | 'missing' | 'error';
  } | null>(null);
  const [work, setWork] = useState<Working | null>(null);
  const [rev, setRev] = useState(0);
  const [save, setSave] = useState<SaveState>('saved');
  const [nonce, setNonce] = useState(0);
  const latest = useRef<{ work: Working | null; rev: number; save: SaveState }>({
    work: null,
    rev: 0,
    save: 'saved',
  });
  const key = `${courseId}:${nonce}`;
  const status: DraftApi['status'] = loaded?.key === key ? loaded.status : 'loading';
  useEffect(() => {
    latest.current = { work, rev, save };
  });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saving = useRef(false);

  useEffect(() => {
    let live = true;
    const pending = inflight.get(courseId);
    (pending ? pending.then(() => data.getDraft(courseId)) : data.getDraft(courseId)).then(
      (doc: DraftDoc | null) => {
        if (!live) return;
        if (!doc) {
          setLoaded({ key, status: 'missing' });
          return;
        }
        setWork({ course: doc.course, answers: doc.answers });
        setRev(doc.rev);
        setSave('saved');
        setLoaded({ key, status: 'ready' });
      },
      (e: unknown) => {
        if (!live) return;
        log.error('Loading a draft failed', e, { courseId });
        setLoaded({ key, status: 'error' });
      },
    );
    return () => {
      live = false;
    };
  }, [data, courseId, key]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    const { work: current, rev: baseRev, save: state } = latest.current;
    if (!current || state === 'saved' || saving.current) return state === 'saved';
    saving.current = true;
    setSave('saving');
    const request = data.saveDraft(courseId, current, baseRev, uid);
    const settled = request.then(
      () => undefined,
      () => undefined,
    );
    inflight.set(courseId, settled);
    void settled.then(() => {
      if (inflight.get(courseId) === settled) inflight.delete(courseId);
    });
    try {
      const next = await request;
      setRev(next);
      latest.current = { ...latest.current, rev: next };
      // Edits made while the save was in flight leave the draft dirty again.
      const stillDirty = latest.current.work !== current;
      setSave(stillDirty ? 'dirty' : 'saved');
      return !stillDirty;
    } catch (e) {
      if (e instanceof DraftConflictError) setSave('conflict');
      else {
        log.warn('Saving a draft failed', { courseId });
        setSave('error');
      }
      return false;
    } finally {
      saving.current = false;
    }
  }, [data, courseId, uid]);

  const update = useCallback(
    (edit: (w: Working) => Working) => {
      setWork((w) => {
        if (!w) return w;
        const next = edit(w);
        latest.current = { ...latest.current, work: next };
        return next;
      });
      setSave((s) => (s === 'conflict' ? s : 'dirty'));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void saveNow(), AUTOSAVE_MS);
    },
    [saveNow],
  );

  // Flush on the way out, and ask the browser to confirm closing a tab with unsaved edits.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (latest.current.save === 'dirty' || latest.current.save === 'error') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      clearTimeout(timer.current);
      if (latest.current.save === 'dirty') void saveNow();
    };
  }, [saveNow]);

  return { status, work, rev, save, update, saveNow, reload: () => setNonce((n) => n + 1) };
}
