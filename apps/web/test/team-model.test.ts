import { describe, expect, it } from 'vitest';
import type { TeamReportAssignment } from '../src/console/types';
import { isOverdue, reportCourses, reportRows, statusOf } from '../src/team/model';

const NOW = 1_000_000;
const a = (over: Partial<TeamReportAssignment>): TeamReportAssignment => ({
  assignmentId: 'x',
  courseId: 'c',
  courseTitle: 'C',
  status: 'assigned',
  dueAt: null,
  percent: 0,
  teamId: null,
  ...over,
});

describe('team report model', () => {
  it('sorts overdue, then by due date, then undated, then finished, then nothing assigned', () => {
    const rows = reportRows(
      {
        teamId: 't',
        name: 'T',
        members: [
          { email: 'z@x.com', uid: null, displayName: 'Sam', assignments: [] },
          { email: 'y@x.com', uid: null, displayName: 'Sam', assignments: [] },
          {
            email: 'b@x.com',
            uid: null,
            displayName: 'Bea',
            assignments: [
              a({ assignmentId: 'b1', courseTitle: 'Zed', dueAt: null }),
              a({ assignmentId: 'b2', courseTitle: 'Alpha', dueAt: null }),
              a({ assignmentId: 'b3', status: 'completed', dueAt: NOW - 5 }),
              a({ assignmentId: 'b4', status: 'started', dueAt: NOW + 50 }),
            ],
          },
          {
            email: 'a@x.com',
            uid: null,
            displayName: 'Ann',
            assignments: [
              a({ assignmentId: 'a1', dueAt: NOW - 10 }),
              a({ assignmentId: 'a2', dueAt: NOW - 20 }),
              a({ assignmentId: 'a3', dueAt: null }),
            ],
          },
        ],
      },
      NOW,
    );
    expect(rows.map((r) => r.key)).toEqual([
      'a2',
      'a1',
      'b4',
      'a3',
      'b2',
      'b1',
      'b3',
      'z@x.com',
      'y@x.com',
    ]);
  });

  it('words each status and knows when a course is overdue', () => {
    expect(statusOf(a({ status: 'completed', dueAt: 0 }), NOW).label).toBe('Completed');
    expect(statusOf(a({ dueAt: NOW - 1 }), NOW)).toEqual({ label: 'Overdue', tone: 'danger' });
    expect(statusOf(a({ status: 'started' }), NOW).label).toBe('In progress');
    expect(statusOf(a({}), NOW).label).toBe('Not started');
    expect(isOverdue(a({ dueAt: NOW }), NOW)).toBe(false);
  });

  it('lists each course once, by title', () => {
    expect(
      reportCourses({
        teamId: 't',
        name: 'T',
        members: [
          {
            email: 'a',
            uid: null,
            displayName: null,
            assignments: [
              a({ courseId: 'z', courseTitle: 'Zed' }),
              a({ courseId: 'b', courseTitle: 'Bee' }),
            ],
          },
          {
            email: 'b',
            uid: null,
            displayName: null,
            assignments: [a({ courseId: 'z', courseTitle: 'Zed' })],
          },
        ],
      }),
    ).toEqual([
      { id: 'b', title: 'Bee' },
      { id: 'z', title: 'Zed' },
    ]);
  });
});
