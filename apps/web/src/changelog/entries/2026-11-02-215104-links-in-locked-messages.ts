import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-02',
  id: 'LOCKED-LINKS',
  title: 'A message that says what to finish first now opens it',
  area: 'LEARN',
  kind: 'feature',
  why:
    'A toast said "Finish "What Git solves" to open the next lesson" and then disappeared, ' +
    'leaving you to find that lesson in the outline yourself. Now the message has a button ' +
    'that takes you straight there.',
  detail: [
    'The toast for a locked next lesson has Open lesson or Open Quiz, and goes to the item in the way.',
    'A locked lesson or Quiz opened from a link names what to finish first and opens it, instead of "Finish the earlier items".',
    'When your progress cannot be saved, the toast opens that lesson again so you can retry.',
    'A toast action is now a real button rather than underlined text.',
  ],
} satisfies ChangelogEntry;
