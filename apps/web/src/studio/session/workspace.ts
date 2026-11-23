import { COURSE_BYTES_LIMIT, courseBytes, workingSchema } from '@gurukul/schema';
import { MAX_TURN_PARTS } from '@gurukul/schema';
import type { Block, BlockType, Chapter, Course, Item, Turn, TurnPart } from '@gurukul/schema';
import type { ChangeRow, CourseChanges, RowStatus } from '@gurukul/schema/changes';
import type { ChipTone } from '@gurukul/ui';
import type { Working } from '../types';
import type { TranscriptEntry } from './transcript';

/*
 * What the session workspace draws, worked out without React (`.plan/22-desktop-studio.md`, The
 * session workspace): the preview's list of items, each block's mark, the outline with its badges,
 * the header's checks, and the chat grouped into turns. Everything reads `courseChanges`, so the
 * marks never disagree with Review's rows.
 *
 * Rows are found by `<kind>:<id>`. An id repeated by mistake (the schema allows it; publishing
 * refuses it) gets the first row of that id: the marks of a later copy may then be wrong, never the
 * course.
 */

export const STATUS_WORD: Record<RowStatus, string> = {
  added: 'Added',
  changed: 'Changed',
  moved: 'Moved',
  removed: 'Removed',
  renamed: 'Renamed',
};

export const STATUS_TONE: Record<RowStatus, ChipTone> = {
  added: 'accent',
  changed: 'warning',
  moved: 'info',
  removed: 'danger',
  renamed: 'warning',
};

/** The words for a block type, as Studio's editors name it: "Text block". */
export const BLOCK_WORDS: Record<BlockType, string> = {
  markdown: 'Text block',
  video: 'Video block',
  code: 'Code block',
  callout: 'Callout block',
  image: 'Image block',
  embed: 'Embed block',
  file: 'File block',
  check: 'Check block',
};

/** Rows by key, the first of a repeated id only. */
export function rowsByKey(changes: CourseChanges | null): ReadonlyMap<string, ChangeRow> {
  return new Map((changes?.rows ?? []).map((row) => [row.key, row]));
}

const itemKey = (item: Pick<Item, 'type' | 'id'>) => `${item.type}:${item.id}`;

/** One lesson or Quiz the preview can show, numbered like the outline: "2.3". */
export interface PreviewEntry {
  key: string;
  item: Item;
  number: string;
  statuses: RowStatus[];
}

/** Every item of the working copy, in course order, with what happened to it. */
export function previewEntries(
  course: Course,
  rows: ReadonlyMap<string, ChangeRow>,
): PreviewEntry[] {
  return course.chapters.flatMap((chapter, c) =>
    chapter.items.map((item, i) => ({
      key: itemKey(item),
      item,
      number: `${c + 1}.${i + 1}`,
      statuses: rows.get(itemKey(item))?.statuses ?? [],
    })),
  );
}

/** A block as the preview draws it, or the mark of one that was removed. */
export type BlockMark =
  | { kind: 'block'; block: Block; statuses: ('added' | 'changed' | 'moved')[] }
  | { kind: 'removed'; id: string; type: BlockType };

/**
 * A lesson's blocks with their marks, removed ones where they used to be. The row lists every
 * block on either side in display order; the ones still there are the lesson's own, in order.
 */
export function lessonBlocks(blocks: readonly Block[], row: ChangeRow | undefined): BlockMark[] {
  if (row?.kind !== 'lesson')
    return blocks.map((block) => ({ kind: 'block', block, statuses: [] }));
  let next = 0;
  return row.blocks.map((entry): BlockMark => {
    if (entry.statuses.includes('removed'))
      return { kind: 'removed', id: entry.id, type: entry.type };
    const block = blocks[next] as Block;
    next += 1;
    return {
      kind: 'block',
      block,
      statuses: entry.statuses as ('added' | 'changed' | 'moved')[],
    };
  });
}

/** A Quiz's questions that changed, by id, with what happened to each. */
export function questionMarks(
  row: ChangeRow | undefined,
): ReadonlyMap<string, ('added' | 'changed' | 'moved')[]> {
  if (row?.kind !== 'quiz') return new Map();
  return new Map(
    row.questions
      .filter((q) => q.statuses.length > 0 && !q.statuses.includes('removed'))
      .map((q) => [q.id, q.statuses as ('added' | 'changed' | 'moved')[]]),
  );
}

export interface OutlineItem {
  key: string;
  /** The item's id, for its editor (`DSK-19`). */
  id: string;
  type: Item['type'];
  title: string;
  /** "2.3"; null for an item that was removed. */
  number: string | null;
  statuses: RowStatus[];
}

export interface OutlineChapter {
  key: string;
  id: string;
  title: string;
  /** "2"; null for a chapter that was removed. */
  number: string | null;
  statuses: RowStatus[];
  items: OutlineItem[];
}

export interface Outline {
  /** The course details row's statuses, or none. */
  details: RowStatus[];
  landing: RowStatus[];
  chapters: OutlineChapter[];
}

/** A row key without the `#2` a repeated id gets: what the base's own list is matched on. */
const unnumbered = (key: string) => key.replace(/#\d+$/, '');

/**
 * Puts each removed entry right after the nearest entry before it in the base that is still in the
 * new list (first when there is none), as Review places it. Entries are matched by `key`.
 */
function placeRemoved<T extends { key: string }>(
  now: readonly T[],
  removed: readonly T[],
  baseKeys: readonly string[],
): T[] {
  const out = [...now];
  const present = new Set(now.map((e) => e.key));
  // Last first, so entries removed after the same anchor keep their base order.
  for (const entry of [...removed].reverse()) {
    const at = baseKeys.indexOf(unnumbered(entry.key));
    const anchor = baseKeys
      .slice(0, Math.max(at, 0))
      .reverse()
      .find((key) => present.has(key));
    out.splice(out.findIndex((e) => e.key === anchor) + 1, 0, entry);
  }
  return out;
}

/** The chapter tree with Added, Changed, Removed, Moved and Renamed badges, removed ones in place. */
export function outlineOf(
  base: Course | null,
  work: Course,
  changes: CourseChanges | null,
): Outline {
  const rows = changes?.rows ?? [];
  const byKey = rowsByKey(changes);
  const removedItems = (chapterId: string) =>
    rows.filter(
      (r): r is Extract<ChangeRow, { kind: 'lesson' | 'quiz' }> =>
        (r.kind === 'lesson' || r.kind === 'quiz') &&
        r.chapterId === chapterId &&
        r.statuses.includes('removed'),
    );
  const removedItem = (r: Extract<ChangeRow, { kind: 'lesson' | 'quiz' }>): OutlineItem => ({
    key: r.key,
    id: r.id,
    type: r.kind,
    title: (r.before as Item).title,
    number: null,
    statuses: r.statuses,
  });

  const kept: OutlineChapter[] = work.chapters.map((chapter, c) => {
    const items: OutlineItem[] = chapter.items.map((item, i) => ({
      key: itemKey(item),
      id: item.id,
      type: item.type,
      title: item.title,
      number: `${c + 1}.${i + 1}`,
      statuses: byKey.get(itemKey(item))?.statuses ?? [],
    }));
    const baseItems = base?.chapters.find((b) => b.id === chapter.id)?.items ?? [];
    const placed = placeRemoved(
      items,
      removedItems(chapter.id).map(removedItem),
      baseItems.map(itemKey),
    );
    return {
      key: `chapter:${chapter.id}`,
      id: chapter.id,
      title: chapter.title,
      number: String(c + 1),
      statuses: byKey.get(`chapter:${chapter.id}`)?.statuses ?? [],
      items: placed,
    };
  });

  const gone = rows
    .filter(
      (r): r is Extract<ChangeRow, { kind: 'chapter' }> =>
        r.kind === 'chapter' && r.statuses.includes('removed'),
    )
    .map((r): OutlineChapter => ({
      key: r.key,
      id: r.id,
      title: (r.before as Chapter).title,
      number: null,
      statuses: r.statuses,
      items: removedItems(r.id).map(removedItem),
    }));

  return {
    details: byKey.get('course:course')?.statuses ?? [],
    landing: byKey.get('landing:landing')?.statuses ?? [],
    chapters: placeRemoved(
      kept,
      gone,
      (base?.chapters ?? []).map((c) => `chapter:${c.id}`),
    ),
  };
}

/** The two checks that would stop a save (`.plan/22-desktop-studio.md`, Checks), for the header. */
export interface HeaderChecks {
  valid: boolean;
  overLimit: boolean;
}

export function headerChecks(work: Working): HeaderChecks {
  return {
    valid: workingSchema.safeParse(work).success,
    overLimit: courseBytes(work.course, work.answers) > COURSE_BYTES_LIMIT,
  };
}

/** "4 changes · checks pass", "1 change · 2 checks fail". */
export function headerStatus(count: number, checks: HeaderChecks): string {
  const failing = Number(!checks.valid) + Number(checks.overLimit);
  const changes = `${count} ${count === 1 ? 'change' : 'changes'}`;
  if (failing === 0) return `${changes} · checks pass`;
  return `${changes} · ${failing} ${failing === 1 ? 'check fails' : 'checks fail'}`;
}

/** The chat as the log draws it: messages, and after each finished turn its line. */
export type ChatLine =
  | {
      kind: 'entry';
      entry: TranscriptEntry;
      /** On a turn's first reply: what the agent did on the way, in order ("How it got there"). */
      steps: string[];
    }
  | {
      kind: 'turn';
      turn: Turn;
      number: number;
      newest: boolean;
      saved: boolean;
      /** The turn's steps, when it had no reply of its own to carry them. */
      steps: string[];
      /** The turn's replies as text, for Copy; empty when the agent wrote none. */
      reply: string;
      /** Seconds the agent worked, from the Educator's message to the turn's end; null if unknown. */
      seconds: number | null;
    };

/**
 * The transcript with each finished turn's line after the last entry of that turn: the written
 * turns, then the one that could not be written (`unsaved`), if any. The activity entries are not
 * lines of their own: they become the steps of the turn, carried by its first reply (else by its
 * line), so the log keeps what was said and the steps stay a click away. A turn with no entry left
 * (its chat was cut to fit the file) still gets its line, at the end.
 */
export function chatLines(
  transcript: readonly TranscriptEntry[],
  turns: readonly Turn[],
  unsaved: Turn | null = null,
): ChatLine[] {
  const all = unsaved ? [...turns, unsaved] : [...turns];
  const numbered = new Map(all.map((turn, i) => [turn.id, i]));
  const last = new Map<string, number>();
  const steps = new Map<string, string[]>();
  const replies = new Map<string, string[]>();
  const asked = new Map<string, string>();
  transcript.forEach((entry, i) => {
    if (entry.turnId === null) return;
    if (numbered.has(entry.turnId)) last.set(entry.turnId, i);
    const list = steps.get(entry.turnId) ?? [];
    if (entry.kind === 'activity' && list[list.length - 1] !== entry.text) list.push(entry.text);
    steps.set(entry.turnId, list);
    if (entry.kind === 'agent')
      replies.set(entry.turnId, [...(replies.get(entry.turnId) ?? []), entry.text]);
    if (entry.kind === 'educator' && !asked.has(entry.turnId)) asked.set(entry.turnId, entry.at);
  });
  const line = (turn: Turn, carried: boolean): ChatLine => {
    const i = numbered.get(turn.id) as number;
    const from = asked.get(turn.id);
    return {
      kind: 'turn',
      turn,
      number: i + 1,
      newest: i === all.length - 1,
      saved: turn !== unsaved,
      steps: carried ? [] : (steps.get(turn.id) ?? []),
      reply: (replies.get(turn.id) ?? []).join('\n\n'),
      seconds:
        from === undefined || turnBy(turn) !== 'agent'
          ? null
          : Math.max(0, Math.round((Date.parse(turn.at) - Date.parse(from)) / 1000)),
    };
  };
  const out: ChatLine[] = [];
  const carrying = new Set<string>();
  transcript.forEach((entry, i) => {
    if (entry.kind !== 'activity') {
      const first = entry.kind === 'agent' && !carrying.has(entry.turnId);
      if (first) carrying.add(entry.turnId);
      out.push({
        kind: 'entry',
        entry,
        steps: first ? (steps.get(entry.turnId) as string[]) : [],
      });
    }
    const ended = all.find((t) => last.get(t.id) === i);
    if (ended) out.push(line(ended, carrying.has(ended.id)));
  });
  for (const turn of all) if (!last.has(turn.id)) out.push(line(turn, false));
  return out;
}

const PART_ORDER: RowStatus[] = ['added', 'removed', 'renamed', 'changed', 'moved'];

/**
 * A turn's `changes` count and `parts`: one per changed row, named by its title (course details
 * and the landing page by their kind), with its most telling status. The list is cut at
 * `MAX_TURN_PARTS`; `changes` still says how many there were.
 */
export function turnChanged(changes: CourseChanges): Pick<Turn, 'changes' | 'parts'> {
  const parts = changes.rows.slice(0, MAX_TURN_PARTS).map((row): TurnPart => {
    const named =
      row.kind === 'course' || row.kind === 'landing' ? null : (row.after ?? row.before);
    return {
      kind: row.kind,
      title: named?.title.trim().slice(0, 200) || '',
      status: PART_ORDER.find((s) => row.statuses.includes(s)) as RowStatus,
    };
  });
  return { changes: changes.count, parts };
}

/** "45s", "2m 39s", "1h 5m". */
export function workedFor(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Who made a turn, as its line says it: the agent, the Educator by hand (hand edits, Undo this
 * item), or Bring in their changes, the one turn that moves the base (`baseBefore`), which is the
 * stored draft brought in and no hand edit.
 */
export type TurnBy = Turn['by'] | 'draft';

export const turnBy = (turn: Pick<Turn, 'by' | 'baseBefore'>): TurnBy =>
  turn.baseBefore === undefined ? turn.by : 'draft';

const BY_WORDS: Record<TurnBy, string> = {
  agent: '',
  educator: ' · by hand',
  draft: ' · draft brought in',
};

/**
 * "Turn 4 · 4 changes", "Turn 1 · no changes", "Turn 5 · 2 changes · not saved", for the
 * Educator's hand edits "Turn 6 · by hand · 1 change", and for a draft brought in "Turn 7 · draft
 * brought in · 2 changes".
 */
export function turnLabel(
  number: number,
  changes: number,
  saved = true,
  by: TurnBy = 'agent',
): string {
  const count = changes === 0 ? 'no changes' : `${changes} ${changes === 1 ? 'change' : 'changes'}`;
  return `Turn ${number}${BY_WORDS[by]} · ${count}${saved ? '' : ' · not saved'}`;
}

/**
 * A finished turn's footer in three parts, the middle one a link to Review: "Worked for 2m 39s, "
 * "19 changes". The agent's own turn says how long it worked when that is known; the others say who
 * made them, and a turn not written to disk says so.
 */
export function turnFooter(line: Extract<ChatLine, { kind: 'turn' }>): {
  lead: string;
  count: string;
  tail: string;
} {
  const { changes } = line.turn;
  const by = turnBy(line.turn);
  return {
    lead:
      by === 'agent'
        ? line.seconds === null
          ? ''
          : `Worked for ${workedFor(line.seconds)}, `
        : by === 'educator'
          ? 'By hand, '
          : 'Draft brought in, ',
    count: changes === 0 ? 'no changes' : `${changes} ${changes === 1 ? 'change' : 'changes'}`,
    tail: line.saved ? '' : ' · not saved',
  };
}
