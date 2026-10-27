import { describe, expect, it } from 'vitest';
import {
  bold,
  inlineCode,
  italic,
  link,
  numberedList,
  wrapSelection,
} from '../src/studio/blocks/markdownTools';
import { patch } from '../src/studio/patch';

describe('markdown toolbar helpers', () => {
  it('wraps a selection in the middle of the text and keeps it selected', () => {
    expect(bold('say hello now', 4, 9)).toEqual({ text: 'say **hello** now', start: 6, end: 11 });
  });

  it('wraps a selection at the very start and at the very end', () => {
    expect(italic('hello world', 0, 5)).toEqual({ text: '*hello* world', start: 1, end: 6 });
    expect(inlineCode('run ls', 4, 6)).toEqual({ text: 'run `ls`', start: 5, end: 7 });
  });

  it('inserts a selected placeholder when nothing is selected', () => {
    expect(bold('', 0, 0)).toEqual({ text: '**bold text**', start: 2, end: 11 });
    expect(wrapSelection('ab', 1, 1, '(', ')', 'x')).toEqual({ text: 'a(x)b', start: 2, end: 3 });
    expect(inlineCode('a', 1, 1).text).toBe('a`code`');
  });

  it('turns the selection into a link label and selects the address', () => {
    const edit = link('see docs here', 4, 8);
    expect(edit.text).toBe('see [docs](https://) here');
    expect(edit.text.slice(edit.start, edit.end)).toBe('https://');
  });

  it('makes a link from an empty selection', () => {
    const edit = link('', 0, 0);
    expect(edit.text).toBe('[link text](https://)');
    expect(edit.text.slice(edit.start, edit.end)).toBe('https://');
  });

  it('numbers every line the selection touches', () => {
    const edit = numberedList('intro\none\ntwo\nafter', 7, 12);
    expect(edit.text).toBe('intro\n1. one\n2. two\nafter');
    expect(edit.text.slice(edit.start, edit.end)).toBe('1. one\n2. two');
  });

  it('numbers the current line for a caret at the start, the middle and the end', () => {
    expect(numberedList('first', 0, 0).text).toBe('1. first');
    expect(numberedList('a\nsecond\nc', 4, 4).text).toBe('a\n1. second\nc');
    expect(numberedList('a\nlast', 6, 6).text).toBe('a\n1. last');
    expect(numberedList('', 0, 0).text).toBe('1. ');
  });
});

describe('patch', () => {
  it('applies changes and drops a key set to undefined', () => {
    const base: { a: number; b?: string } = { a: 1, b: 'x' };
    expect(patch(base, { a: 2 })).toEqual({ a: 2, b: 'x' });
    expect(Object.keys(patch(base, { b: undefined }))).toEqual(['a']);
    expect(base).toEqual({ a: 1, b: 'x' });
  });
});
