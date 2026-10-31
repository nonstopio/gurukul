import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'GURUKUL-SWITCH-ROWS',
  title: 'Every on/off setting is a row with its switch on the right',
  area: 'DESIGN',
  kind: 'fix',
  why:
    'Role settings put the switch at the right edge of a row, while course rules, quiz settings, ' +
    'assigning and the block editors put it on the left of a label. A switch now sits in the same ' +
    'place everywhere, so people do not have to look for it.',
  detail: [
    'Settings → Daily reminders, Studio course rules, quiz settings, Assign and the video and code block editors use the same row.',
    'Buttons with an icon have a little less padding on the icon side, so icon and label sit centred.',
  ],
} satisfies ChangelogEntry;
