import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  checkEventName,
  checkUserId,
  cleanParams,
  cleanUserProperties,
  looksLikePii,
} from '../src/analytics/core/validate';

describe('event names', () => {
  it('accepts snake_case names', () => {
    expect(checkEventName('course_start')).toEqual({ ok: true, value: 'course_start' });
  });
  it.each(['Login', '1st', 'has-dash', '', 'a b'])('rejects the shape of %j', (name) => {
    expect(checkEventName(name)).toMatchObject({ ok: false });
  });
  it('rejects a name over 40 characters', () => {
    expect(checkEventName('a'.repeat(LIMITS.eventName + 1))).toMatchObject({ ok: false });
    expect(checkEventName('a'.repeat(LIMITS.eventName))).toMatchObject({ ok: true });
  });
  it.each(['firebase_x', 'google_x', 'ga_x'])('rejects the reserved prefix of %s', (name) => {
    expect(checkEventName(name)).toMatchObject({ ok: false });
  });
  it('rejects a name GA4 reserves, but allows page_view', () => {
    expect(checkEventName('session_start')).toMatchObject({ ok: false });
    expect(checkEventName('page_view')).toMatchObject({ ok: true });
  });
});

describe('parameters', () => {
  it('keeps strings, numbers and booleans', () => {
    expect(cleanParams({ a: 'x', b: 2, c: false })).toEqual({
      value: { a: 'x', b: 2, c: false },
      problems: [],
    });
  });
  it('drops a bad name, an object and an undefined', () => {
    const { value, problems } = cleanParams({ 'Bad-Name': 1, obj: {}, nope: undefined, ok: 1 });
    expect(value).toEqual({ ok: 1 });
    expect(problems).toHaveLength(3);
  });
  it('drops a name over 40 characters and a reserved prefix', () => {
    const { value } = cleanParams({ ['a'.repeat(41)]: 1, firebase_x: 1, ok: 1 });
    expect(value).toEqual({ ok: 1 });
  });
  it('cuts a string to 100 characters, and keeps the longer limit for page_location', () => {
    const long = 'x'.repeat(150);
    const { value, problems } = cleanParams({ note: long, page_location: long });
    expect(value.note).toHaveLength(LIMITS.paramValue);
    expect(value.page_location).toHaveLength(150);
    expect(problems).toHaveLength(1);
    expect(cleanParams({ page_title: 'y'.repeat(400) }).value.page_title).toHaveLength(300);
  });
  it('keeps only 25 parameters', () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`p${i}`, i]));
    const { value, problems } = cleanParams(many);
    expect(Object.keys(value)).toHaveLength(LIMITS.params);
    expect(problems).toHaveLength(5);
  });
  it('strips emails, phone numbers and keys that name personal data', () => {
    const { value } = cleanParams({
      who: 'ada@example.com',
      call: '+91 98765 43210',
      email: 'x',
      user_phone: 'x',
      course_id: 'git-basics',
      count: 9876543210,
    });
    expect(value).toEqual({ course_id: 'git-basics', count: 9876543210 });
  });
});

describe('user properties', () => {
  it('limits names to 24 characters and values to 36', () => {
    const { value, problems } = cleanUserProperties({
      role: 'x'.repeat(50),
      ['n'.repeat(25)]: 'a',
    });
    expect(value.role).toHaveLength(LIMITS.propValue);
    expect(problems).toHaveLength(2);
  });
});

describe('user ids', () => {
  it('accepts an opaque id', () => {
    expect(checkUserId('k3j2h4kj2h4')).toEqual({ ok: true, value: 'k3j2h4kj2h4' });
  });
  it('rejects an email, a phone number, an empty id and a long one', () => {
    expect(checkUserId('ada@example.com')).toMatchObject({ ok: false });
    expect(checkUserId('+919876543210')).toMatchObject({ ok: false });
    expect(checkUserId('')).toMatchObject({ ok: false });
    expect(checkUserId('a'.repeat(257))).toMatchObject({ ok: false });
  });
});

it('tells personal data from an id', () => {
  expect(looksLikePii('ada@example.com')).toBe(true);
  expect(looksLikePii('abc123def456')).toBe(false);
});
