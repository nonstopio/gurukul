import type { ChangelogEntry } from '../types';

export default {
  date: '2026-10-31',
  id: 'GURUKUL-LOGO',
  title: 'Gurukul has its own logo',
  area: 'PLATFORM',
  kind: 'feature',
  why: 'The sign-in page and the sidebar showed the NonStop logo with "Gurukul" typed beside it in another font, so the two never read as one name.',
  detail: [
    "NonStop's N tile with Gurukul set in NonStop's lettering, its k in brand green like NonStop's S.",
    'It flips between dark and white lettering with the theme, on sign-in and in the sidebar.',
  ],
} satisfies ChangelogEntry;
