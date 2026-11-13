import { describe, expect, it } from 'vitest';
import {
  buildAssignedEmail,
  buildDeadlineEmail,
  buildReminderEmail,
  buildRevokedEmail,
  courseLink,
  formatDue,
} from '../src/mail.js';
import { escapeHtml } from '../src/mail-html.js';

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
    expect(m.subject).toBe('New course on NonStop Gurukul: Git basics');
    expect(m.text).toContain('a course on NonStop Gurukul');
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
    expect(m.subject).toBe('You have 2 new courses on NonStop Gurukul');
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
      expect(m.subject).toBe('2 courses on NonStop Gurukul are overdue or due soon');
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
      expect(overdue.subject).toBe('Overdue: Git on NonStop Gurukul');
      expect(overdue).not.toHaveProperty('cc');
      expect(overdue.text).not.toContain('Due soon');
      expect(overdue.text).not.toContain('Also waiting');
      expect(overdue.text).not.toContain('copied');
      const dueSoon = buildDeadlineEmail(
        'p@example.com',
        { overdue: [], dueSoon: [soon], others: [] },
        [],
      );
      expect(dueSoon.subject).toBe('Due soon: SQL on NonStop Gurukul');
      expect(dueSoon.text).not.toContain('Past the due date');
      const two = buildDeadlineEmail('p@example.com', {
        overdue: [],
        dueSoon: [soon, soon],
        others: [],
      });
      expect(two.subject).toBe('2 courses on NonStop Gurukul are due soon');
    });
  });
});

describe('email html', () => {
  const site = 'https://nonstop-gurukul.web.app';
  const evil = { id: 'a&b', title: '<script>alert(1)</script> "a" & b' };
  const due = Date.UTC(2026, 11, 31);

  it('shares one layout: lang, preheader, logo, footer and a mailto link', () => {
    const { html } = buildAssignedEmail('a@example.com', [{ id: 'git', title: 'Git' }], due);
    expect(html).toMatch(/^<!doctype html><html lang="en">/);
    expect(html).toContain('<title>New course on NonStop Gurukul: Git</title>');
    expect(html).toContain('mso-hide:all');
    expect(html).toContain(`<img src="${site}/icon-192.png" alt="" width="36" height="36"`);
    expect(html).toContain('NonStop io Technologies');
    expect(html).toContain('href="mailto:gurukul@nonstopio.com"');
    expect(html).toContain('You are receiving this because a course was assigned to you.');
  });

  it('uses SITE_URL for the logo and links', () => {
    process.env['SITE_URL'] = 'https://staging.example.com/';
    const { html } = buildAssignedEmail('a@example.com', [{ id: 'git', title: 'Git' }], null);
    process.env['SITE_URL'] = '';
    expect(html).toContain('https://staging.example.com/icon-192.png');
    expect(html).toContain('href="https://staging.example.com/courses/git"');
  });

  it('assigned: a card with a due line and a Start course button for one course', () => {
    const { html } = buildAssignedEmail('a@example.com', [{ id: 'git', title: 'Git' }], due);
    expect(html).toContain('Finish by 31 Dec 2026');
    expect(html).toContain('Open course');
    expect(html).toMatch(
      /href="https:\/\/nonstop-gurukul.web.app\/courses\/git"[^>]*>Start course/,
    );
  });

  it('assigned: several courses open the site, and no due date means no due line', () => {
    const { html } = buildAssignedEmail(
      'a@example.com',
      [
        { id: 'git', title: 'Git' },
        { id: 'sql', title: 'SQL' },
      ],
      null,
    );
    expect(html).toMatch(new RegExp(`href="${site}"[^>]*>Open NonStop Gurukul`));
    expect(html).not.toContain('Finish by');
    expect(html.match(/Open course/g)).toHaveLength(2);
  });

  it('reminder: Continue course for one, the site for several, own due dates', () => {
    const one = buildReminderEmail('a@example.com', [{ id: 'git', title: 'Git', dueAt: due }]);
    expect(one.html).toContain('Continue course');
    expect(one.html).toContain('Finish by 31 Dec 2026');
    expect(one.html).toContain('Your course is waiting');
    const many = buildReminderEmail('a@example.com', [
      { id: 'git', title: 'Git', dueAt: due },
      { id: 'sql', title: 'SQL', dueAt: null },
    ]);
    expect(many.html).toContain('Open NonStop Gurukul');
    expect(many.html).toContain('Your courses are waiting');
    expect(many.html.match(/Finish by/g)).toHaveLength(1);
  });

  it('deadline: labelled sections, red and amber accents, the manager note only with cc', () => {
    const c = (id: string, dueAt: number | null) => ({ id, title: id, dueAt });
    const m = buildDeadlineEmail(
      'p@example.com',
      { overdue: [c('a', due)], dueSoon: [c('b', due)], others: [c('c', null)] },
      ['m@example.com'],
    );
    for (const label of ['Past the due date', 'Due soon', 'Also waiting for you']) {
      expect(m.html).toContain(label);
    }
    expect(m.html).toContain('Was due 31 Dec 2026');
    expect(m.html).toContain('#b42318');
    expect(m.html).toContain('#93370d');
    expect(m.html).toContain('manager is copied');
    expect(m.html).toContain('Open NonStop Gurukul');
    expect(m.html).toContain('Courses need your attention');
    const lateSolo = buildDeadlineEmail('p@example.com', {
      overdue: [c('a', due)],
      dueSoon: [],
      others: [],
    });
    expect(lateSolo.html).toContain('A course is past its due date');
    const solo = buildDeadlineEmail('p@example.com', {
      overdue: [],
      dueSoon: [c('b', due)],
      others: [],
    });
    expect(solo.html).not.toContain('manager is copied');
    expect(solo.html).not.toContain('Past the due date');
    expect(solo.html).toContain('A course is due soon');
    expect(solo.html).toContain('Continue course');
  });

  it('revoked: a callout with a mailto link and no button or open link', () => {
    const { html } = buildRevokedEmail('a@example.com', 'Git');
    expect(html).toContain('Certificate');
    expect(html).toContain('mailto:gurukul@nonstopio.com');
    expect(html).not.toContain('Open course');
    expect(html).not.toContain('bgcolor="#05764c"');
  });

  it('escapes every dynamic value', () => {
    const all = [
      buildAssignedEmail('a@example.com', [evil], due).html,
      buildReminderEmail('a@example.com', [{ ...evil, dueAt: null }]).html,
      buildDeadlineEmail('a@example.com', {
        overdue: [{ ...evil, dueAt: due }],
        dueSoon: [],
        others: [],
      }).html,
      buildRevokedEmail('a@example.com', evil.title).html,
    ];
    for (const html of all) {
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &quot;a&quot; &amp; b');
    }
    expect(all[0]).toContain('/courses/a%26b"');
    expect(escapeHtml(`'`)).toBe('&#39;');
  });
});
