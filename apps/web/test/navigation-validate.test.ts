import { describe, expect, it } from 'vitest';
import { AREAS } from '../src/navigation';
import { validateNavigation } from '../src/navigation/validate';
import type { AreaNavigation } from '../src/navigation/types';
import { ROUTE_PATHS } from '../src/route-paths';

const area = (over: Partial<AreaNavigation> = {}): AreaNavigation => ({
  slug: 'learn',
  name: 'Learning',
  pages: [{ id: 'home', path: '/', label: 'Home' }],
  ...over,
});

describe('validateNavigation', () => {
  it('is clean for the real metadata and route table', () => {
    expect(validateNavigation(AREAS, ROUTE_PATHS)).toEqual([]);
  });

  it('is clean when every route is a page or unlisted with a reason', () => {
    const a = area({
      roles: ['learner', 'educator', 'admin'],
      unlisted: {
        '/courses/:id': { context: 'needs a course id' },
        '/dev': { excluded: 'dev only' },
      },
    });
    expect(validateNavigation([a], ['/', '/courses/:id', '/dev'])).toEqual([]);
  });

  it('reports an unclassified route', () => {
    expect(validateNavigation([area()], ['/', '/studio'])).toEqual([
      expect.stringContaining('/studio: route is not classified'),
    ]);
  });

  it('reports a page or unlisted entry whose route does not exist', () => {
    const a = area({ unlisted: { '/gone': { excluded: 'old' } } });
    expect(validateNavigation([a], [])).toEqual([
      'learn › home: route / does not exist in routes.tsx',
      'learn › unlisted /gone: route /gone does not exist in routes.tsx',
    ]);
  });

  it('reports duplicate slugs, ids and routes', () => {
    const problems = validateNavigation(
      [area(), area({ pages: [{ id: 'home', path: '/', label: 'Again' }] })],
      ['/'],
    );
    expect(problems).toEqual([
      'learn: area slug is used twice',
      'learn › home: page id is used twice',
      'learn › home: route / is already classified by learn › home',
    ]);
  });

  it('reports empty names and labels, unknown roles and empty keywords', () => {
    const a = area({
      name: ' ',
      roles: ['guru' as never],
      keywords: [''],
      pages: [
        { id: 'home', path: '/', label: ' ', roles: ['superuser' as never], keywords: [' '] },
      ],
    });
    expect(validateNavigation([a], ['/'])).toEqual([
      'learn: area name is empty',
      'learn: unknown role "guru"',
      'learn: keywords must be non-empty strings',
      'learn › home: label is empty',
      'learn › home: unknown role "superuser"',
      'learn › home: keywords must be non-empty strings',
    ]);
  });
});
