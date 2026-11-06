import { describe, expect, it } from 'vitest';
import {
  buildAssignedEmail,
  buildDeadlineEmail,
  buildReminderEmail,
  buildRevokedEmail,
  courseLink,
  formatDue,
} from '../src/mail.js';

describe('mail builders', () => {
  it('links a course on the public site', () => {
    expect(courseLink('git-basics')).toBe('https://nonstop-gurukul.web.app/courses/git-basics');
  });

  it('formats a due date as a UTC day', () => {
    expect(formatDue(Date.UTC(2026, 10, 12, 23, 30))).toBe('12 Nov 2026');
  });

  it('builds the email for one new course, with its due date', () => {
    const m = buildAssignedEmail(
      'a@example.com',
      [{ id: 'git', title: 'Git basics' }],
      Date.UTC(2026, 10, 12),
    );
    expect(m.to).toBe('a@example.com');
    expect(m.subject).toBe('New course on NonStop Academy: Git basics');
    expect(m.text).toContain('a course on NonStop Academy');
    expect(m.text).toContain('- Git basics: https://nonstop-gurukul.web.app/courses/git');
    expect(m.text).toContain('finish it by 12 Nov 2026');
  });

  it('lists several courses in one email and leaves out an absent due date', () => {
    const m = buildAssignedEmail(
      'a@example.com',
      [
        { id: 'git', title: 'Git' },
        { id: 'sql', title: 'SQL' },
      ],
      null,
    );
    expect(m.subject).toBe('You have 2 new courses on NonStop Academy');
    expect(m.text).toContain('these courses');
    expect(m.text).toContain('/courses/sql');
    expect(m.text).not.toContain('finish it by');
  });

  it('builds a reminder', () => {
    const m = buildReminderEmail('a@example.com', [
      { id: 'git', title: 'Git', dueAt: Date.UTC(2026, 0, 5) },
    ]);
    expect(m.subject).toBe('Reminder: Git is waiting for you');
    expect(m.text).toContain('https://nonstop-gurukul.web.app/courses/git');
    expect(m.text).toContain('5 Jan 2026');
    expect(
      buildReminderEmail('a@example.com', [{ id: 'git', title: 'Git', dueAt: null }]).text,
    ).not.toContain('finish it by');
  });

  it('builds one reminder for several courses, each with its own due date', () => {
    const m = buildReminderEmail('a@example.com', [
      { id: 'git', title: 'Git', dueAt: Date.UTC(2026, 0, 5) },
      { id: 'sql', title: 'SQL', dueAt: null },
    ]);
    expect(m.subject).toBe('Reminder: 2 courses are waiting for you');
    expect(m.text).toContain(
      '- Git: https://nonstop-gurukul.web.app/courses/git (finish by 5 Jan 2026)',
    );
    expect(m.text).toContain('- SQL: https://nonstop-gurukul.web.app/courses/sql\n');
  });
});

describe('buildRevokedEmail', () => {
  it('names the course and a contact', () => {
    const m = buildRevokedEmail('a@example.com', 'Git basics');
    expect(m.to).toBe('a@example.com');
    expect(m.subject).toBe('Your certificate for Git basics was revoked');
    expect(m.text).toContain('"Git basics"');
    expect(m.text).toContain('gurukul@nonstopio.com');
  });

  describe('deadline email', () => {
    const late = { id: 'git', title: 'Git', dueAt: Date.UTC(2026, 10, 1) };
    const soon = { id: 'sql', title: 'SQL', dueAt: Date.UTC(2026, 10, 9) };
    const other = { id: 'css', title: 'CSS', dueAt: null };

    it('lists overdue, then due soon, then the rest, and says the manager is copied', () => {
      const m = buildDeadlineEmail(
        'p@example.com',
        { overdue: [late], dueSoon: [soon], others: [other, { ...soon, id: 'go', title: 'Go' }] },
        ['m@example.com'],
      );
      expect(m.to).toBe('p@example.com');
      expect(m.cc).toEqual(['m@example.com']);
      expect(m.subject).toBe('2 courses on NonStop Academy are overdue or due soon');
      expect(m.text).toContain(
        '- Git: https://nonstop-gurukul.web.app/courses/git (was due 1 Nov 2026)',
      );
      expect(m.text).toContain('(finish by 9 Nov 2026)');
      expect(m.text).toContain('- CSS: https://nonstop-gurukul.web.app/courses/css\n');
      const order = ['Past the due date', 'Due soon', 'Also waiting for you'].map((h) =>
        m.text.indexOf(h),
      );
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(order[0]).toBeGreaterThan(0);
      expect(m.text).toContain('manager is copied');
    });

    it('names a single course in the subject and copies nobody by default', () => {
      const overdue = buildDeadlineEmail('p@example.com', {
        overdue: [late],
        dueSoon: [],
        others: [],
      });
      expect(overdue.subject).toBe('Overdue: Git on NonStop Academy');
      expect(overdue).not.toHaveProperty('cc');
      expect(overdue.text).not.toContain('Due soon');
      expect(overdue.text).not.toContain('Also waiting');
      expect(overdue.text).not.toContain('copied');
      const dueSoon = buildDeadlineEmail(
        'p@example.com',
        { overdue: [], dueSoon: [soon], others: [] },
        [],
      );
      expect(dueSoon.subject).toBe('Due soon: SQL on NonStop Academy');
      expect(dueSoon.text).not.toContain('Past the due date');
      const two = buildDeadlineEmail('p@example.com', {
        overdue: [],
        dueSoon: [soon, soon],
        others: [],
      });
      expect(two.subject).toBe('2 courses on NonStop Academy are due soon');
    });
  });
});
