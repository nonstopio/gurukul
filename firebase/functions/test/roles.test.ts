import { describe, expect, it } from 'vitest';
import { isAllowedEmail, rolesFromClaims } from '../src/index.js';

describe('rolesFromClaims', () => {
  it('makes everyone a shishya', () => {
    expect(rolesFromClaims(undefined)).toEqual(['shishya']);
    expect(rolesFromClaims({})).toEqual(['shishya']);
  });

  it('adds granted roles only when the claim is exactly true', () => {
    expect(rolesFromClaims({ acharya: true })).toEqual(['shishya', 'acharya']);
    expect(rolesFromClaims({ kulapati: true })).toEqual(['shishya', 'kulapati']);
    expect(rolesFromClaims({ acharya: true, kulapati: true })).toEqual([
      'shishya',
      'acharya',
      'kulapati',
    ]);
    expect(rolesFromClaims({ acharya: false, kulapati: false })).toEqual(['shishya']);
  });
});

describe('isAllowedEmail', () => {
  it('accepts NonStop accounts, case-insensitively', () => {
    expect(isAllowedEmail('priya.k@nonstopio.com')).toBe(true);
    expect(isAllowedEmail('Priya.K@NonStopIO.com')).toBe(true);
  });

  it('rejects other domains, look-alikes and missing emails', () => {
    expect(isAllowedEmail('rahul@gmail.com')).toBe(false);
    expect(isAllowedEmail('x@evil-nonstopio.com')).toBe(false);
    expect(isAllowedEmail(undefined)).toBe(false);
    expect(isAllowedEmail('')).toBe(false);
  });

  it('takes another domain for tests and forks', () => {
    expect(isAllowedEmail('a@example.org', 'example.org')).toBe(true);
  });
});
