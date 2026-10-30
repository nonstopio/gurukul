import { describe, expect, it } from 'vitest';
import { PUBLIC_ACCESS, accessOf, canOpen, courseAccessSchema, userSchema } from '../src';
import { ts } from './fixtures';

describe('course access', () => {
  it('reads a missing or broken access as public', () => {
    expect(accessOf({})).toEqual(PUBLIC_ACCESS);
    expect(accessOf({ visibility: 'secret' })).toEqual(PUBLIC_ACCESS);
    expect(accessOf({ visibility: 'teams', visibleTeamIds: [] })).toEqual(PUBLIC_ACCESS);
  });
  it('keeps a valid access', () => {
    const teams = { visibility: 'teams', visibleTeamIds: ['platform'] };
    expect(accessOf(teams)).toEqual(teams);
    expect(courseAccessSchema.safeParse({ visibility: 'staff', visibleTeamIds: [] }).success).toBe(
      true,
    );
    const many = Array.from({ length: 31 }, (_, i) => `t${i}`);
    expect(
      courseAccessSchema.safeParse({ visibility: 'teams', visibleTeamIds: many }).success,
    ).toBe(false);
  });
  it('decides who can open a course, as the rules do', () => {
    const learner = { teamIds: ['platform'], staff: false };
    expect(canOpen({}, learner)).toBe(true);
    expect(canOpen({ visibility: 'public' }, learner)).toBe(true);
    expect(canOpen({ visibility: 'teams', visibleTeamIds: ['platform'] }, learner)).toBe(true);
    expect(canOpen({ visibility: 'teams', visibleTeamIds: ['qa'] }, learner)).toBe(false);
    expect(canOpen({ visibility: 'teams' }, learner)).toBe(false);
    expect(canOpen({ visibility: 'staff' }, learner)).toBe(false);
    expect(canOpen({ visibility: 'staff' }, { teamIds: [], staff: true })).toBe(true);
  });
  it('lets a profile carry team ids', () => {
    const user = {
      email: 'a@nonstopio.com',
      displayName: 'A',
      photoURL: null,
      team: null,
      roles: ['learner'],
      grantedCourseIds: [],
      createdAt: ts(1),
    };
    expect(userSchema.safeParse({ ...user, teamIds: ['platform'] }).success).toBe(true);
    expect(userSchema.safeParse(user).success).toBe(true);
  });
});
