import { describe, expect, it } from 'vitest';
import { buildAssignedEmail, buildReminderEmail, courseLink, formatDue } from '../src/mail.js';

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
    const m = buildReminderEmail(
      'a@example.com',
      { id: 'git', title: 'Git' },
      Date.UTC(2026, 0, 5),
    );
    expect(m.subject).toBe('Reminder: Git is waiting for you');
    expect(m.text).toContain('https://nonstop-gurukul.web.app/courses/git');
    expect(m.text).toContain('5 Jan 2026');
    expect(
      buildReminderEmail('a@example.com', { id: 'git', title: 'Git' }, null).text,
    ).not.toContain('finish it by');
  });
});
