import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORG_CONFIG,
  assignmentId,
  assignmentSchema,
  certificateSchema,
  courseCode,
  credentialId,
  isAllowedEmail,
  normalizeEmail,
  orgConfigSchema,
  progressSchema,
  rolesFromClaims,
  userSchema,
  nameKey,
} from '../src';
import { ts } from './fixtures';

describe('roles', () => {
  it('makes everyone a shishya and adds granted roles', () => {
    expect(rolesFromClaims(undefined)).toEqual(['shishya']);
    expect(rolesFromClaims({ acharya: true })).toEqual(['shishya', 'acharya']);
    expect(rolesFromClaims({ acharya: true, kulapati: true })).toEqual([
      'shishya',
      'acharya',
      'kulapati',
    ]);
    expect(rolesFromClaims({ acharya: false, kulapati: false })).toEqual(['shishya']);
  });

  it('allows only the NonStop domain, in any letter case', () => {
    expect(isAllowedEmail('a@nonstopio.com')).toBe(true);
    expect(isAllowedEmail('A@NonStopIO.com')).toBe(true);
    expect(isAllowedEmail('a@gmail.com')).toBe(false);
    expect(isAllowedEmail('a@nonstopio.com.evil.io')).toBe(false);
    expect(isAllowedEmail(undefined)).toBe(false);
    expect(isAllowedEmail(null)).toBe(false);
    expect(isAllowedEmail('a@example.com', 'example.com')).toBe(true);
  });
});

describe('document shapes', () => {
  it('validates a user, an org config and the default config', () => {
    expect(
      userSchema.safeParse({
        email: 'a@nonstopio.com',
        displayName: 'A',
        photoURL: null,
        team: null,
        roles: ['shishya'],
        grantedCourseIds: [],
        createdAt: ts(1),
      }).success,
    ).toBe(true);
    expect(
      userSchema.safeParse({
        email: 'a@nonstopio.com',
        displayName: 'Ananya Rao',
        nameLower: nameKey('Ananya Rao'),
        photoURL: null,
        team: null,
        roles: ['shishya'],
        grantedCourseIds: [],
        createdAt: ts(1),
      }).data?.nameLower,
    ).toBe('ananya rao');
    expect(orgConfigSchema.safeParse(DEFAULT_ORG_CONFIG).success).toBe(true);
    expect(orgConfigSchema.safeParse({ ...DEFAULT_ORG_CONFIG, domain: '' }).success).toBe(false);
  });

  it('validates assignments and builds idempotent ids', () => {
    const base = {
      email: 'a@nonstopio.com',
      uid: null,
      courseId: 'git',
      assignedBy: 'u',
      assignedAt: ts(1),
      dueAt: null,
      mandatory: true,
      reminder: 'weekly',
      status: 'assigned',
    };
    expect(assignmentSchema.safeParse(base).success).toBe(true);
    expect(assignmentSchema.safeParse({ ...base, reminder: 'daily' }).success).toBe(false);
    expect(assignmentSchema.safeParse({ ...base, lastRemindedAt: ts(5) }).success).toBe(true);
    expect(assignmentSchema.safeParse({ ...base, lastRemindedAt: null }).success).toBe(true);
    expect(normalizeEmail('  A@NonStopIO.com ')).toBe('a@nonstopio.com');
    expect(assignmentId('git', 'abc')).toBe('git__abc');
  });

  it('derives the course code from the first token of the course id', () => {
    expect(courseCode('git-basics')).toBe('GIT');
    expect(courseCode('security')).toBe('SECURITY');
    expect(courseCode('react-19-intro')).toBe('REACT');
  });

  it('validates certificates and builds credential ids', () => {
    expect(credentialId('git', 2026, 412)).toBe('NSG-GIT-26-0412');
    expect(credentialId('g-i.t', 2105, 5)).toBe('NSG-GIT-05-0005');
    const cert = {
      id: 'NSG-GIT-26-0412',
      uid: 'u',
      learnerName: 'A',
      courseId: 'git',
      courseTitle: 'Git',
      courseVersion: 1,
      issuedAt: ts(1),
      signatoryName: 'S',
      signatoryRole: 'R',
      revoked: false,
    };
    expect(certificateSchema.safeParse(cert).success).toBe(true);
    expect(certificateSchema.safeParse({ ...cert, id: 'x' }).success).toBe(false);
  });

  it('validates progress', () => {
    const p = {
      uid: 'u',
      courseId: 'git',
      courseVersion: 1,
      startedAt: ts(1),
      lastItemId: null,
      lastActiveAt: ts(1),
      completedItemIds: [],
      pariksha: { q1: { best: 1, passed: true, attempts: 1, lastAttemptAt: ts(1) } },
      percent: 0,
      completedAt: null,
      certificateId: null,
    };
    expect(progressSchema.safeParse(p).success).toBe(true);
    expect(progressSchema.safeParse({ ...p, percent: 101 }).success).toBe(false);
  });
});
