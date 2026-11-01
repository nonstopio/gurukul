import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-01',
  id: 'ADMIN-EMAIL-TEMPLATES',
  title: 'Admins can see every email Gurukul sends and send themselves a test',
  area: 'ADMIN',
  kind: 'feature',
  why:
    'Nobody could check what a learner receives, or that email works at all, without assigning ' +
    'a real course to a real person. A test to your own inbox settles it in one click.',
  detail: [
    'Open Email templates in the Admin console: each template shows when it is sent, its subject and its text.',
    'Pick a template and press Send test email: it arrives in your own inbox with sample data and "[Test]" in the subject.',
    'If email is not set up on this deployment, you are told instead of seeing a false success.',
  ],
} satisfies ChangelogEntry;
