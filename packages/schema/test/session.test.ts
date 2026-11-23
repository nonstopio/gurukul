import { describe, expect, it } from 'vitest';
import {
  SESSION_CHECKPOINTS_KEPT,
  SESSION_FILES_DAYS,
  SESSION_SCHEMA_VERSION,
  authoringSessionSchema,
  type AuthoringSession,
} from '../src/session';
import { makeCourse } from './fixtures';

const NOW = '2026-05-01T10:00:00.000Z';
const work = { course: makeCourse(), answers: { q1: { a: ['x'] } } };

function session(over: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 1,
    id: 's1',
    uid: 'u1',
    kind: 'edit',
    courseId: 'git',
    title: 'Simplify the rebase chapter',
    goals: [{ text: 'Shorter lessons', done: false }],
    summary: '',
    status: 'open',
    base: { rev: 3, savedAt: NOW, work },
    work,
    turns: [
      { id: 't1', at: NOW, by: 'agent', summary: 'Cut it', checkpoint: 't1.json', changes: 2 },
    ],
    todos: [{ id: 'd1', text: 'Add a screenshot', itemId: 'l1', done: false, createdAt: NOW }],
    viewed: [],
    agentSessionId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const todo = (id: string) => ({ id, text: 'x', done: true, createdAt: NOW });
const turn = (id: string) => ({
  id,
  at: NOW,
  by: 'educator',
  summary: '',
  checkpoint: `${id}.json`,
  changes: 0,
});

describe('the model and effort picks', () => {
  it('read as absent from a session written before they existed, and as picked when present', () => {
    expect(authoringSessionSchema.parse(session())).not.toHaveProperty('model');
    const picked = authoringSessionSchema.parse(session({ model: 'opus', effort: 'low' }));
    expect(picked).toMatchObject({ model: 'opus', effort: 'low' });
  });

  it('refuse a name outside the lists, which would reach the shell as a flag', () => {
    expect(authoringSessionSchema.safeParse(session({ model: '--model' })).success).toBe(false);
    expect(authoringSessionSchema.safeParse(session({ effort: 'max' })).success).toBe(false);
  });
});

describe('constants', () => {
  it('pins the documented values', () => {
    expect([SESSION_SCHEMA_VERSION, SESSION_CHECKPOINTS_KEPT, SESSION_FILES_DAYS]).toEqual([
      1, 30, 30,
    ]);
  });
});

describe('authoringSessionSchema accepts', () => {
  it.each([
    ['an edit session', session()],
    ['a new session before its first save', session({ kind: 'new', courseId: null, base: null })],
    ['a new session after its first save', session({ kind: 'new' })],
    [
      'a saved session with answersChanged',
      session({ status: 'saved', work: { ...work, answersChanged: true } }),
    ],
    ['dates with a UTC offset', session({ createdAt: '2026-05-01T15:30:00+05:30' })],
    [
      'a turn that moved the base, with the base from before it kept',
      session({ turns: [{ ...turn('t1'), baseBefore: 't1.base.json' }] }),
    ],
  ])('%s', (_name, value) => {
    const parsed = authoringSessionSchema.safeParse(value);
    expect(parsed.success).toBe(true);
    const typed: AuthoringSession | undefined = parsed.data;
    expect(typed?.id).toBe('s1');
  });
});

describe('authoringSessionSchema rejects', () => {
  it.each([
    ['a bad kind', { kind: 'copy' }, ['kind']],
    ['a bad status', { status: 'done' }, ['status']],
    ['a bad created date', { createdAt: 'yesterday' }, ['createdAt']],
    ['a bad turn date', { turns: [{ ...turn('t1'), at: '2026-05-01' }] }, ['turns', 0, 'at']],
    ['a bad turn author', { turns: [{ ...turn('t1'), by: 'bot' }] }, ['turns', 0, 'by']],
    ['negative changes', { turns: [{ ...turn('t1'), changes: -1 }] }, ['turns', 0, 'changes']],
    ['a wrong version', { schemaVersion: 2 }, ['schemaVersion']],
    ['an empty title', { title: '' }, ['title']],
    ['an empty goal', { goals: [{ text: '', done: false }] }, ['goals', 0, 'text']],
    ['too many todos', { todos: Array.from({ length: 101 }, (_, i) => todo(`d${i}`)) }, ['todos']],
    ['a bad slug', { courseId: 'Not A Slug' }, ['courseId']],
    ['duplicate turn ids', { turns: [turn('t1'), turn('t1')] }, ['turns']],
    ['duplicate todo ids', { todos: [todo('d1'), todo('d1')] }, ['todos']],
    ['an edit without a base', { base: null }, ['base']],
    ['an edit without a course', { courseId: null, base: null }, ['courseId']],
    ['a base without a course', { kind: 'new', courseId: null }, ['courseId']],
    ['a course that is not the working one', { courseId: 'other' }, ['work', 'course', 'id']],
    [
      'a base from another course',
      { base: { rev: 3, savedAt: NOW, work: { ...work, course: makeCourse({ id: 'other' }) } } },
      ['base', 'work', 'course', 'id'],
    ],
    ['a new session with a course but no base', { kind: 'new', base: null }, ['base']],
    [
      'a checkpoint outside the session folder',
      { turns: [{ ...turn('t1'), checkpoint: '../../x.json' }] },
      ['turns', 0, 'checkpoint'],
    ],
    [
      'an empty checkpoint name',
      { turns: [{ ...turn('t1'), checkpoint: '' }] },
      ['turns', 0, 'checkpoint'],
    ],
    [
      'a base kept outside the session folder',
      { turns: [{ ...turn('t1'), baseBefore: '../t1.base.json' }] },
      ['turns', 0, 'baseBefore'],
    ],
  ])('%s', (_name, over, path) => {
    const parsed = authoringSessionSchema.safeParse(session(over));
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.path)).toContainEqual(path);
  });

  it('words each rule so an Educator or a log can read it', () => {
    const parsed = authoringSessionSchema.safeParse(session({ turns: [turn('t1'), turn('t1')] }));
    expect(parsed.error?.issues[0]?.message).toBe('The turn id "t1" is used twice.');
  });
});
