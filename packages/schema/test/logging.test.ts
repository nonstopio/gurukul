import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MASK_EXCLUDES,
  DEFAULT_MASK_RULES,
  REDACTED,
  STANDARD_LOG_FIELDS,
  globMatches,
  maskFields,
  maskLine,
  maskValue,
} from '../src';

describe('globMatches', () => {
  it('matches case-insensitively, with * as a wildcard and exact otherwise', () => {
    expect(globMatches('*email*', 'learnerEmail')).toBe(true);
    expect(globMatches('*EMAIL*', 'email')).toBe(true);
    expect(globMatches('email', 'email')).toBe(true);
    expect(globMatches('email', 'emailAddress')).toBe(false);
    expect(globMatches('a.b*', 'a.bc')).toBe(true);
    expect(globMatches('a.b', 'axb')).toBe(false);
  });
});

describe('maskValue', () => {
  it('redacts, keeps an email prefix, keeps the last four digits', () => {
    expect(maskValue('x', 'REDACT')).toBe(REDACTED);
    expect(maskValue('ajay.kumar@nonstopio.com', 'EMAIL_PREFIX')).toBe('ajay.*****');
    expect(maskValue('ab@x.io', 'EMAIL_PREFIX')).toBe('ab*****');
    expect(maskValue('+91 98765 43210', 'LAST4')).toBe('****3210');
    expect(maskValue('none', 'LAST4')).toBe(REDACTED);
  });
});

describe('maskFields', () => {
  const payload = {
    uid: 'u1',
    email: 'ajay.kumar@nonstopio.com',
    emailVerified: true,
    displayName: 'Ajay Kumar',
    nameLower: 'ajay kumar',
    courseName: 'Git',
    phone: '9876543210',
    nested: { token: 'abc', list: [{ password: 'p', ok: 1 }], missing: null },
    idToken: undefined,
  };

  it('masks by field name at any depth, leaving everything else alone', () => {
    expect(maskFields(payload, { level: 'info' })).toEqual({
      uid: 'u1',
      email: 'ajay.*****',
      emailVerified: true,
      displayName: REDACTED,
      nameLower: REDACTED,
      courseName: 'Git',
      phone: '****3210',
      nested: { token: REDACTED, list: [{ password: REDACTED, ok: 1 }], missing: null },
      idToken: undefined,
    });
  });

  it('never mutates its input', () => {
    const copy = structuredClone(payload);
    maskFields(payload);
    expect(payload).toEqual(copy);
  });

  it('does not hide a certificate credentialId, which is a public identifier', () => {
    expect(maskFields({ credentialId: 'NSG-GIT-26-0001', credential: 'secret' })).toEqual({
      credentialId: 'NSG-GIT-26-0001',
      credential: REDACTED,
    });
  });

  it('keeps customer data at DEBUG but still hides credentials and answer keys', () => {
    const out = maskFields(
      { email: 'a@b.io', password: 'p', correctOptionIds: ['a'], answerKey: { q: ['b'] } },
      { level: 'debug' },
    );
    expect(out).toEqual({
      email: 'a@b.io',
      password: REDACTED,
      correctOptionIds: REDACTED,
      answerKey: REDACTED,
    });
  });

  it('masks DEBUG too when asked, and masks only `always` rules when disabled', () => {
    expect(maskFields({ email: 'a@b.io' }, { level: 'debug', maskDebug: true })).toEqual({
      email: 'a*****',
    });
    expect(maskFields({ email: 'a@b.io', token: 't' }, { enabled: false })).toEqual({
      email: 'a@b.io',
      token: REDACTED,
    });
  });

  it('lets an always rule beat a partial one, and honours custom rules and excludes', () => {
    expect(maskFields({ emailToken: 'x' }, {})).toEqual({ emailToken: REDACTED });
    expect(
      maskFields({ guardian: 'G' }, { rules: [{ pattern: 'guardian', type: 'REDACT' }] }),
    ).toEqual({ guardian: REDACTED });
    expect(maskFields({ email: 'a@b.io' }, { excludes: ['email'] })).toEqual({ email: 'a@b.io' });
  });

  it('turns an Error into a masked name and message, and passes primitives through', () => {
    expect(maskFields(new Error('failed for a@b.io'))).toEqual({
      name: 'Error',
      message: 'failed for a*****',
    });
    expect(maskFields(5)).toBe(5);
    expect(maskFields('text')).toBe('text');
    expect(maskFields(null)).toBeNull();
  });

  it('cuts off a value nested too deeply instead of following it', () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 10; i++) deep = { next: deep };
    expect(JSON.stringify(maskFields(deep))).toContain('[TRUNCATED]');
  });
});

describe('maskLine', () => {
  it('masks key=value and JSON pairs by key, and any bare email', () => {
    expect(maskLine('Signup email=ajay.kumar@nonstopio.com uid=u1 token=abc')).toBe(
      'Signup email=ajay.***** uid=u1 token=[REDACTED]',
    );
    expect(maskLine('{"displayName":"Ajay","uid":"u1"}')).toBe(
      '{"displayName":"[REDACTED]","uid":"u1"}',
    );
    expect(maskLine('contact ajay.kumar@nonstopio.com please')).toBe('contact ajay.***** please');
    expect(maskLine('nothing here')).toBe('nothing here');
  });

  it('leaves emails and customer keys at DEBUG, but never credentials', () => {
    expect(maskLine('a@b.io email=a@b.io token=t', { level: 'debug' })).toBe(
      'a@b.io email=a@b.io token=[REDACTED]',
    );
  });
});

describe('the defaults', () => {
  it('ship rules and exclusions, and a standard vocabulary', () => {
    expect(DEFAULT_MASK_RULES.length).toBeGreaterThan(10);
    expect(DEFAULT_MASK_RULES.some((r) => r.always)).toBe(true);
    expect(DEFAULT_MASK_EXCLUDES).toContain('*emailverified*');
    expect(STANDARD_LOG_FIELDS).toContain('traceId');
  });
});
