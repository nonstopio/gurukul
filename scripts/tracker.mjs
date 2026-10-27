// Reads .plan/tracker.md: prints what is done and open per section, and the next item to pick up.
//   node scripts/tracker.mjs           summary and the next pickable item
//   node scripts/tracker.mjs --check   exit 1 if the tracker is malformed or its summary is stale
// The tracker is the status of the plan (.plan/); the pick-up-next skill works through it one item,
// one pull request, at a time. Open pull requests claim items too; this script cannot see them, so
// the skill checks GitHub before taking what `next` returns.
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const STATUSES = ['done', 'todo', 'blocked', 'maintainer'];
const ID = /^[A-Z]{2,4}-\d{2}$/;

function cells(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

const unticked = (c) => c.replace(/^`|`$/g, '');

/** Sections (## headings) with their item rows, the summary rows and the pick order. */
export function parse(text) {
  const sections = [];
  const summary = [];
  const pickOrder = [];
  let total = null;
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      current = { title: heading[1], items: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    if (current.title === 'Pick order') {
      const m = /^\d+\.\s+`?([A-Z]{2,4}-\d{2})`?/.exec(line);
      if (m) pickOrder.push(m[1]);
      continue;
    }
    if (!line.startsWith('|') || /^\|[\s:|-]+\|$/.test(line)) continue;
    const row = cells(line);
    if (current.title === 'Summary') {
      const counted = row.slice(1, 5).map(Number);
      if (row[0] === '**Total**') total = counted;
      else if (row[0] !== 'Section') summary.push({ section: row[0], counts: counted });
      continue;
    }
    if (row[0] === 'ID') continue;
    const [id, item, status, depends = ''] = row.map(unticked);
    current.items.push({
      id,
      item,
      status,
      depends: depends
        .split(',')
        .map((d) => unticked(d.trim()))
        .filter((d) => d && d !== '—'),
    });
  }
  return { sections: sections.filter((s) => s.items.length > 0), summary, total, pickOrder };
}

export function counts(section) {
  return STATUSES.map((s) => section.items.filter((i) => i.status === s).length);
}

/** Every problem with the tracker, as sentences. Empty means it is consistent. */
export function problems({ sections, summary, total, pickOrder }) {
  const found = [];
  const items = sections.flatMap((s) => s.items);
  const byId = new Map();
  for (const i of items) {
    if (!ID.test(i.id)) found.push(`${i.id}: id is not AREA-NN`);
    if (byId.has(i.id)) found.push(`${i.id}: listed twice`);
    byId.set(i.id, i);
    if (!STATUSES.includes(i.status)) {
      found.push(`${i.id}: status "${i.status}" is not one of ${STATUSES.join(', ')}`);
    }
  }
  for (const i of items) {
    for (const d of i.depends) if (!byId.has(d)) found.push(`${i.id}: depends on unknown ${d}`);
  }
  const open = items.filter((i) => i.status === 'todo' || i.status === 'blocked').map((i) => i.id);
  for (const id of open) {
    if (!pickOrder.includes(id)) found.push(`${id}: open but missing from the pick order`);
  }
  const seen = new Set();
  for (const id of pickOrder) {
    if (seen.has(id)) found.push(`${id}: twice in the pick order`);
    seen.add(id);
    if (!open.includes(id)) found.push(`${id}: in the pick order but not todo or blocked`);
  }
  const titles = sections.map((s) => s.title);
  for (const s of sections) {
    const row = summary.find((r) => r.section === s.title);
    if (!row) {
      found.push(`Summary: no row for "${s.title}"`);
      continue;
    }
    const actual = counts(s);
    if (row.counts.join() !== actual.join()) {
      found.push(
        `Summary: "${s.title}" says ${row.counts.join('/')}, rows say ${actual.join('/')}`,
      );
    }
  }
  for (const r of summary) {
    if (!titles.includes(r.section)) found.push(`Summary: "${r.section}" is not a section`);
  }
  const all = STATUSES.map((s) => items.filter((i) => i.status === s).length);
  if (total?.join() !== all.join()) {
    found.push(`Summary: Total says ${total?.join('/') ?? 'nothing'}, rows say ${all.join('/')}`);
  }
  return found;
}

/** The first todo in the pick order whose dependencies are all done, not in `claimed`. */
export function next({ sections, pickOrder }, claimed = []) {
  const byId = new Map(sections.flatMap((s) => s.items).map((i) => [i.id, i]));
  return (
    pickOrder
      .map((id) => byId.get(id))
      .find(
        (i) =>
          i?.status === 'todo' &&
          !claimed.includes(i.id) &&
          i.depends.every((d) => byId.get(d)?.status === 'done'),
      ) ?? null
  );
}

export function report(tracker) {
  const lines = sections(tracker);
  const n = next(tracker);
  lines.push('', n ? `Next: ${n.id} ${n.item}` : 'Next: nothing pickable');
  return lines.join('\n');
}

function sections({ sections: list }) {
  const pad = Math.max(...list.map((s) => s.title.length));
  return [
    `${'Section'.padEnd(pad)}  done  todo  blocked  maintainer`,
    ...list.map((s) => {
      const [d, t, b, m] = counts(s);
      return `${s.title.padEnd(pad)}  ${String(d).padStart(4)}  ${String(t).padStart(4)}  ${String(b).padStart(7)}  ${String(m).padStart(10)}`;
    }),
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = path.resolve(import.meta.dirname, '../.plan/tracker.md');
  const tracker = parse(readFileSync(file, 'utf8'));
  const found = problems(tracker);
  if (found.length > 0) {
    for (const p of found) process.stderr.write(`x ${p}\n`);
    process.exit(1);
  }
  if (!process.argv.includes('--check')) process.stdout.write(`${report(tracker)}\n`);
}
