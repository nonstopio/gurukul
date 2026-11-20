import { describe, expect, it } from 'vitest';
import { countBand, sessionBands } from '../src/studio/session/events';

describe('the bands session events count in', () => {
  it.each([
    [-1, '0'],
    [0, '0'],
    [1, '1-5'],
    [5, '1-5'],
    [6, '6-20'],
    [20, '6-20'],
    [21, '21-50'],
    [50, '21-50'],
    [51, '51+'],
    [900, '51+'],
  ])('puts %i in %s', (n, band) => {
    expect(countBand(n)).toBe(band);
  });

  it('gives a session’s changes and turns, and nothing else', () => {
    expect(sessionBands(12, 3)).toEqual({ change_band: '6-20', turn_band: '1-5' });
  });
});
