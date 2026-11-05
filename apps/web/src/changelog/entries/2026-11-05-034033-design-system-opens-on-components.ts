import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-05',
  id: 'DESIGN-OPENS-ON-COMPONENTS',
  title: 'The Design system page opens on Components',
  area: 'DESIGN',
  kind: 'feature',
  why:
    'People open the Design system page to find a component and its rule; tokens are the ' +
    'reference behind them, so Components now comes first.',
} satisfies ChangelogEntry;
