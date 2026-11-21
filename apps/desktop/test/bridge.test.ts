import { describe, expect, it } from 'vitest';
import {
  BRIDGE_ERRORS,
  BRIDGE_VERSION,
  CALLS,
  EVENTS,
  MAX_ASK_PROMPT_LENGTH,
  MAX_ASK_REPLY_LENGTH,
  MAX_ASKS_RUNNING,
  MAX_MESSAGE_LENGTH,
  MAX_PATH_SEGMENTS,
  MAX_SEGMENT_LENGTH,
  MAX_SKILL_PATH_SEGMENTS,
  MAX_SOURCE_NAME_LENGTH,
  channel,
  eventChannel,
  isPlainFileName,
  isSafePath,
  isSafeSegment,
} from '../src/bridge';

describe('bridge contract', () => {
  it('is version 1 with every call of the plan', () => {
    expect(BRIDGE_VERSION).toBe(3);
    expect(CALLS).toEqual([
      'info',
      'store.read',
      'store.write',
      'store.list',
      'store.remove',
      'agent.status',
      'agent.start',
      'agent.send',
      'agent.stop',
      'agent.close',
      'agent.forget',
      'agent.toolResult',
      'agent.ask',
      'agent.cancelAsk',
      'sources.ensure',
      'sources.list',
      'sources.reveal',
      'sources.read',
      'auth.googleSignIn',
      'app.checkForUpdate',
      'app.installUpdate',
    ]);
    expect(EVENTS).toEqual(['agent.onEvent', 'agent.onToolCall', 'app.onUpdateReady']);
  });

  it('namespaces every channel, calls and events apart', () => {
    expect(channel('store.read')).toBe('gurukul:store.read');
    expect(eventChannel('agent.onEvent')).toBe('gurukul-event:agent.onEvent');
    const calls = new Set(CALLS.map(channel));
    expect(EVENTS.map(eventChannel).some((c) => calls.has(c))).toBe(false);
  });

  it('refuses with three constant messages', () => {
    expect(BRIDGE_ERRORS).toEqual({
      refused: 'Not allowed',
      invalid: 'Invalid arguments',
      notAvailable: 'Not available in this version',
    });
  });

  it('keeps a skill inside the session folder’s depth', () => {
    expect(MAX_SKILL_PATH_SEGMENTS).toBe(2);
  });

  it('holds an ask to a message’s length, a short reply and two at a time', () => {
    expect(MAX_ASK_PROMPT_LENGTH).toBe(MAX_MESSAGE_LENGTH);
    expect(MAX_ASK_REPLY_LENGTH).toBe(16 * 1024);
    expect(MAX_ASKS_RUNNING).toBe(2);
  });
});

describe('isPlainFileName', () => {
  it.each(['notes.md', 'Rebase notes (draft).md', 'पाठ.txt', '.env', 'a'.repeat(255)])(
    'accepts %s',
    (name) => {
      expect(isPlainFileName(name)).toBe(true);
    },
  );

  it.each([
    ['empty', ''],
    ['the current folder', '.'],
    ['the parent folder', '..'],
    ['a slash', 'a/b'],
    ['a backslash', 'a\\b'],
    ['a NUL byte', 'a\0b'],
    ['a name that is too long', 'a'.repeat(MAX_SOURCE_NAME_LENGTH + 1)],
  ])('refuses %s', (_label, name) => {
    expect(isPlainFileName(name)).toBe(false);
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
