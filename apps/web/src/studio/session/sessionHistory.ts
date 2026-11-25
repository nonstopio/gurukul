import type { AuthoringSession } from '@gurukul/schema';
import type { SessionHistory, SessionList } from './store';

/** What a row of the session history says, whether the session's files are still here or not. */
export interface HistoryRow {
  id: string;
  title: string;
  summary: string;
  status: 'open' | 'saved' | 'discarded';
  /** The course's title; null for a new course that was never created, or one whose files are gone. */
  course: string | null;
  kind: 'new' | 'edit';
  /** A removed session only has its record: no chat, no course to open. */
  removed: boolean;
  startedAt: string;
  /** When it was last changed; for a saved or discarded session, when it was closed. */
  endedAt: string;
  turns: number;
  changes: number;
  goals: number;
  goalsDone: number;
  todosLeft: number;
}

/** The filters the page offers. */
export type HistoryStatus = HistoryRow['status'] | 'all';

const fromSession = (s: AuthoringSession): HistoryRow => ({
  id: s.id,
  title: s.title,
  summary: s.summary,
  status: s.status,
  course: s.kind === 'edit' ? s.work.course.title : null,
  kind: s.kind,
  removed: false,
  startedAt: s.createdAt,
  endedAt: s.updatedAt,
  turns: s.turns.length,
  changes: s.turns.reduce((sum, t) => sum + t.changes, 0),
  goals: s.goals.length,
  goalsDone: s.goals.filter((g) => g.done).length,
  todosLeft: s.todos.filter((t) => !t.done).length,
});

const fromHistory = (h: SessionHistory): HistoryRow => ({
  id: h.id,
  title: h.title,
  summary: h.summary,
  status: h.status,
  course: null,
  kind: h.kind,
  removed: true,
  startedAt: h.createdAt,
  endedAt: h.closedAt,
  turns: h.turns,
  changes: h.changes,
  goals: h.goals,
  goalsDone: h.goalsDone,
  todosLeft: h.todosLeft,
});

/** Every session on this computer, the ones whose files were removed too, newest activity first. */
export function historyRows(list: SessionList): HistoryRow[] {
  return [...list.sessions.map(fromSession), ...list.history.map(fromHistory)].sort((a, b) =>
    b.endedAt.localeCompare(a.endedAt),
  );
}

/** The rows with that status, then the ones whose title, summary or course contains the words. */
export function filterRows(rows: HistoryRow[], status: HistoryStatus, query: string): HistoryRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (status !== 'all' && r.status !== status) return false;
    const text = `${r.title} ${r.summary} ${r.course ?? ''}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** How many rows each status filter holds. */
export function statusCounts(rows: HistoryRow[]): Record<HistoryStatus, number> {
  const count = (s: HistoryRow['status']) => rows.filter((r) => r.status === s).length;
  return {
    all: rows.length,
    open: count('open'),
    saved: count('saved'),
    discarded: count('discarded'),
  };
}

/** "25 Nov 2026, 14:30": the person's own clock, since a session is a thing that happened to them. */
export function whenLabel(iso: string): string {
  const at = new Date(iso);
  const day = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

/** First change to last, not time spent chatting: "Under a minute", "35 min", "2 h 5 min", "3 days". */
export function spanLabel(from: string, to: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));
  if (minutes < 1) return 'Under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
