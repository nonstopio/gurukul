import type { AreaNavigation } from '../types';

/**
 * Pages that belong to no single area: the changelog, and the public certificate check that
 * anyone with the link can open. Learner, Admin console and Studio pages live in their
 * own area files.
 */
export const navigation = {
  slug: 'platform',
  name: 'Gurukul',
  pages: [
    {
      id: 'changelog',
      path: '/changelog',
      label: 'Changelog',
      description: 'Every change, newest first, with the reason it was made',
      keywords: ['what changed', 'release notes', 'releases', 'updates', 'new'],
    },
  ],
  unlisted: {
    '/privacy': {
      context:
        'the privacy policy: linked from sign-in and the accept-policy screen, not the sidebar',
    },
    '/verify/:id': { context: 'public page for one credential id, shared as a link' },
  },
} satisfies AreaNavigation;
