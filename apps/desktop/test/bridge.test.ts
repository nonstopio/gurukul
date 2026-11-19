import { describe, expect, it } from 'vitest';
import {
  BRIDGE_VERSION,
  CALLS,
  MAX_PATH_SEGMENTS,
  MAX_SEGMENT_LENGTH,
  channel,
  isSafePath,
  isSafeSegment,
} from '../src/bridge';

describe('bridge contract', () => {
  it('is version 1 with the info and store calls', () => {
    expect(BRIDGE_VERSION).toBe(1);
    expect(CALLS).toEqual(['info', 'store.read', 'store.write', 'store.list', 'store.remove']);
  });

  it('namespaces every channel', () => {
    expect(channel('store.read')).toBe('gurukul:store.read');
  });
});

describe('isSafeSegment', () => {
  it.each([
    'session.json',
    'transcript.jsonl',
    'prompt.md',
    't-4_b',
    'abc123XYZ',
    'a'.repeat(MAX_SEGMENT_LENGTH),
  ])('accepts %s', (name) => {
    expect(isSafeSegment(name)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['the current folder', '.'],
    ['the parent folder', '..'],
    ['a dot file', '.hidden'],
    ['a trailing dot', 'name.'],
    ['a slash', 'a/b'],
    ['a backslash', 'a\\b'],
    ['a drive letter', 'C:'],
    ['a space', 'a b'],
    ['a NUL byte', 'a\0b'],
    ['a Windows device', 'CON'],
    ['a Windows device with an extension', 'nul.json'],
    ['a numbered Windows device', 'com1'],
    ['a name that is too long', 'a'.repeat(MAX_SEGMENT_LENGTH + 1)],
    ['non-ASCII letters', 'pāṭha'],
  ])('refuses %s', (_label, name) => {
    expect(isSafeSegment(name)).toBe(false);
  });

  it('allows names that only start like a Windows device', () => {
    expect(isSafeSegment('console.json')).toBe(true);
  });
});

describe('isSafePath', () => {
  it('accepts a nested relative path up to the depth limit', () => {
    expect(isSafePath('checkpoints/t4.json')).toBe(true);
    expect(isSafePath(Array(MAX_PATH_SEGMENTS).fill('a').join('/'))).toBe(true);
  });

  it.each([
    [
      'too deep',
      Array(MAX_PATH_SEGMENTS + 1)
        .fill('a')
        .join('/'),
    ],
    ['absolute', '/etc/passwd'],
    ['climbing out', '../../other/session.json'],
    ['climbing out in the middle', 'checkpoints/../../x'],
    ['an empty segment', 'checkpoints//t4.json'],
    ['a trailing slash', 'checkpoints/'],
    ['Windows separators', 'checkpoints\\t4.json'],
  ])('refuses a path %s', (_label, path) => {
    expect(isSafePath(path)).toBe(false);
  });
});
