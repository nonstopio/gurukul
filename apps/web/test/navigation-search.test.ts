import { describe, expect, it } from 'vitest';
import { indexDestinations, normalize, searchDestinations } from '../src/navigation/search';
import type { Destination } from '../src/navigation/types';

const dest = (id: string, label: string, over: Partial<Destination> = {}): Destination => ({
  id,
  path: `/${id}`,
  label,
  areaName: 'Gurukul',
  description: '',
  keywords: [],
  ...over,
});

const catalog = [
  dest('home', 'Home', { keywords: ['start'] }),
  dest('changelog', 'Changelog', { keywords: ['release notes'], description: 'Every change' }),
  dest('learners', 'Learners', { areaName: 'Admin console' }),
  dest('blog', 'Dialog box', { areaName: 'Studio', keywords: ['notebook'] }),
];
const ids = (q: string) => searchDestinations(indexDestinations(catalog), q).map((d) => d.id);

describe('normalize', () => {
  it('lower-cases, strips accents and folds punctuation to single spaces', () => {
    expect(normalize('  Parīkṣā — II!! ')).toBe('pariksa ii');
  });
});

describe('searchDestinations', () => {
  it('returns everything in catalog order for an empty query', () => {
    expect(ids('   ')).toEqual(['home', 'changelog', 'learners', 'blog']);
  });

  it('ranks an exact label above a prefix above a contains', () => {
    const list = [dest('a', 'Logs'), dest('b', 'Changelog'), dest('c', 'Log')];
    expect(searchDestinations(indexDestinations(list), 'log').map((d) => d.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('matches every term along the area and label path', () => {
    expect(ids('admin learn')).toEqual(['learners']);
    expect(ids('gurukul home')).toEqual(['home']);
  });

  it('falls back to keywords and descriptions', () => {
    expect(ids('release notes')).toEqual(['changelog']);
    expect(ids('every change')).toEqual(['changelog']);
    expect(ids('start')).toEqual(['home']);
  });

  it('matches a label that contains the query even when the terms are too short to match words', () => {
    expect(ids('g b')).toEqual(['blog']);
  });

  it('matches inside words only from three characters', () => {
    expect(ids('ebo')).toEqual(['blog']);
    expect(ids('eb')).toEqual([]);
  });

  it('keeps catalog order on a tie and finds nothing for nonsense', () => {
    expect(ids('gurukul')).toEqual(['home', 'changelog']);
    expect(ids('zzz')).toEqual([]);
  });

  it('stays fast against a thousand destinations', () => {
    const many = Array.from({ length: 1000 }, (_, i) => dest(`p${i}`, `Page number ${i}`));
    const index = indexDestinations(many);
    const start = performance.now();
    for (let i = 0; i < 20; i += 1) searchDestinations(index, 'page 99');
    expect((performance.now() - start) / 20).toBeLessThan(25);
  });
});
