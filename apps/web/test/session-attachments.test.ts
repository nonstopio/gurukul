import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_LABEL_MAX,
  COURSE_TARGET,
  LANDING_TARGET,
  attachTargetSchema,
  attachmentKey,
  attachmentLabel,
  attachmentNote,
  blockTarget,
  chapterTarget,
  cleanTarget,
  itemTarget,
  questionTarget,
} from '../src/studio/session/attachments';
import type { AttachTarget } from '../src/studio/session/attachments';

const WORDS = { lesson: 'Lesson', quiz: 'Pariksha', chapter: 'Parva' };

describe('attached parts of the course', () => {
  it('names each kind of part in plain words, with the ids the agent’s tools take', () => {
    expect(chapterTarget(WORDS, { id: 'c2', title: 'Rebase' }, '2')).toEqual({
      kind: 'chapter',
      ids: { chapterId: 'c2' },
      label: 'Parva 2 · Rebase',
    });
    expect(chapterTarget(WORDS, { id: 'c2', title: '  ' }, '2').label).toBe('Parva 2');
    expect(itemTarget(WORDS, { id: 'l1', type: 'lesson', title: 'Why rebase' }, '3.2')).toEqual({
      kind: 'item',
      ids: { itemId: 'l1' },
      label: 'Lesson 3.2 · Why rebase',
    });
    expect(itemTarget(WORDS, { id: 'q1', type: 'quiz', title: 'Check' }, '3.4').label).toBe(
      'Pariksha 3.4 · Check',
    );
    expect(blockTarget(WORDS, 'l1', '3.2', { id: 'b2' }, 'Text block', 2)).toEqual({
      kind: 'block',
      ids: { itemId: 'l1', blockId: 'b2' },
      label: 'Lesson 3.2 · Text block 2',
    });
    expect(questionTarget(WORDS, 'q1', '2.4', 'qq3', 3)).toEqual({
      kind: 'question',
      ids: { itemId: 'q1', questionId: 'qq3' },
      label: 'Pariksha 2.4 · Question 3',
    });
    expect(COURSE_TARGET.label).toBe('Course details');
    expect(LANDING_TARGET.label).toBe('Landing page');
  });

  it('keys a part by what it points at, whatever its label', () => {
    expect(attachmentKey(blockTarget(WORDS, 'l1', '3.2', { id: 'b2' }, 'Text block', 2))).toBe(
      'block:l1:b2',
    );
    const renamed: AttachTarget = { ...COURSE_TARGET, label: 'Other words' };
    expect(attachmentKey(renamed)).toBe('course');
  });

  it('keys ids in their fixed order, whatever order they were written in', () => {
    const reversed: AttachTarget = {
      kind: 'block',
      ids: { blockId: 'b2', itemId: 'l1' },
      label: 'x',
    };
    expect(attachmentKey(reversed)).toBe('block:l1:b2');
    expect(attachmentKey(cleanTarget(reversed) as AttachTarget)).toBe('block:l1:b2');
  });

  it('never gives two parts one key when an id holds a colon', () => {
    const a: AttachTarget = { kind: 'block', ids: { itemId: 'x:a', blockId: 'b' }, label: 'A' };
    const b: AttachTarget = { kind: 'block', ids: { itemId: 'x', blockId: 'a:b' }, label: 'B' };
    expect(attachmentKey(a)).not.toBe(attachmentKey(b));
    expect(attachmentKey(a)).toBe('block:x%3Aa:b');
  });

  it('keeps a label to one line and cuts a long one on a word', () => {
    expect(attachmentLabel('  Lesson\n3.2  ')).toBe('Lesson 3.2');
    expect(attachmentLabel('   ')).toBe('Untitled');
    const long = attachmentLabel(`${'word '.repeat(40)}end`);
    expect(long.length).toBeLessThanOrEqual(ATTACHMENT_LABEL_MAX);
    expect(long.endsWith('word…')).toBe(true);
    expect(attachmentLabel('x'.repeat(200))).toBe(`${'x'.repeat(ATTACHMENT_LABEL_MAX - 1)}…`);
  });

  it('checks a target before it is kept', () => {
    const block = blockTarget(WORDS, 'l1', '3.2', { id: 'b2' }, 'Text block', 2);
    expect(cleanTarget({ ...block, label: `  ${'long '.repeat(40)}` })?.label).toMatch(
      /^(long ){22}long…$/,
    );
    expect(cleanTarget({ ...block, ids: { itemId: '', blockId: 'b2' } })).toBeNull();
    expect(
      cleanTarget({ kind: 'item', ids: { itemId: 'l1', extra: 'x' }, label: 'L' } as never),
    ).toBeNull();
    expect(attachTargetSchema.safeParse({ kind: 'nothing', ids: {}, label: 'L' }).success).toBe(
      false,
    );
  });

  it('tells the agent what is attached, with each part’s kind and ids as JSON', () => {
    expect(attachmentNote([])).toBe('');
    const one: AttachTarget[] = [blockTarget(WORDS, 'l1', '3.2', { id: 'b2' }, 'Text block', 2)];
    expect(attachmentNote(one)).toBe(
      '[From Gurukul: the Educator attached this part of the course to the message below. "This", "it" and "here" in it mean this part.]\n' +
        '- Lesson 3.2 · Text block 2: {"kind":"block","itemId":"l1","blockId":"b2"}\n\n',
    );
    const two = attachmentNote([...one, LANDING_TARGET]);
    expect(two).toContain('attached these parts');
    expect(two).toContain('mean these parts.');
    expect(two).toContain('- Landing page: {"kind":"landing"}\n');
    // Each line's JSON is the target's kind and ids, as the system prompt explains.
    const json = two.split('\n')[1]?.split(': ').slice(1).join(': ');
    expect(JSON.parse(json as string)).toEqual({ kind: 'block', itemId: 'l1', blockId: 'b2' });
  });

  it('names added files to the agent after the parts, and keys them by name', () => {
    const files: AttachTarget[] = ['a.docx', 'b.xlsx'].map((name) => ({
      kind: 'file',
      ids: { name },
      label: name,
    }));
    expect(attachmentNote(files)).toBe(
      '[From Gurukul: Files added to the Sources folder: a.docx, b.xlsx. Read them with read_source.]\n\n',
    );
    expect(attachmentNote([...files, LANDING_TARGET])).toMatch(
      /^\[From Gurukul: the Educator attached this part[\s\S]*\[From Gurukul: Files added/,
    );
    expect(attachmentKey(files[0] as AttachTarget)).toBe('file:a.docx');
    expect(cleanTarget(files[1] as AttachTarget)).toEqual(files[1]);
  });
});
