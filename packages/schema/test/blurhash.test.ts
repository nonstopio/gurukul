import { describe, expect, it } from 'vitest';
import {
  blurHashAverageColor,
  courseSchema,
  decodeBlurHash,
  encodeBlurHash,
  isValidBlurHash,
} from '../src';
import { makeCourse } from './fixtures';
import vectors from './blurhash-vectors.json';

type Case = { w: number; h: number; cx: number; cy: number; hash: string; dec: number[] };
const expected = vectors as Record<string, Case>;

/** The same synthetic pictures the reference `blurhash` package (MIT, 2.0.5) was run on. */
function picture(w: number, h: number, f: (x: number, y: number) => [number, number, number]) {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y);
      p.set([r, g, b, 255], (y * w + x) * 4);
    }
  }
  return p;
}
const pictures: Record<string, Uint8ClampedArray> = {
  solid: picture(8, 8, () => [200, 40, 90]),
  gradient: picture(32, 24, (x, y) => [x * 8, y * 10, (x + y) * 4]),
  checker: picture(16, 16, (x, y) => (((x >> 2) + (y >> 2)) % 2 ? [250, 250, 250] : [10, 20, 30])),
  wide: picture(40, 10, (x, y) => [x * 6, 255 - x * 6, y * 25]),
  black: picture(4, 4, () => [0, 0, 0]),
};

/** Mean absolute error between a picture and a hash decoded at the picture's own size. */
function error(hash: string, c: Case, pixels: Uint8ClampedArray): number {
  const out = decodeBlurHash(hash, c.w, c.h);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < out.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      sum += Math.abs((out[i + k] as number) - (pixels[i + k] as number));
      n++;
    }
  }
  return sum / n;
}

describe('BlurHash against the reference implementation (blurhash 2.0.5, MIT)', () => {
  it.each(Object.keys(expected))(
    'decodes the reference hash of the %s picture identically',
    (name) => {
      const c = expected[name] as Case;
      expect(Array.from(decodeBlurHash(c.hash, 6, 5))).toEqual(c.dec);
    },
  );
  it.each(['solid', 'wide', 'black'])('encodes the %s picture to the same hash', (name) => {
    const c = expected[name] as Case;
    const pixels = pictures[name] as Uint8ClampedArray;
    const hash = encodeBlurHash(pixels, c.w, c.h, { componentsX: c.cx, componentsY: c.cy });
    expect(hash).toBe(c.hash);
    expect(isValidBlurHash(hash)).toBe(true);
  });
  // The reference takes the largest AC value without its sign, so a picture whose strongest detail
  // is negative gets a coarser scale. This encoder follows the BlurHash specification (absolute
  // value), so it must be at least as close to the picture; it may not be the same string.
  it.each(['gradient', 'checker'])('encodes the %s picture at least as accurately', (name) => {
    const c = expected[name] as Case;
    const pixels = pictures[name] as Uint8ClampedArray;
    const hash = encodeBlurHash(pixels, c.w, c.h, { componentsX: c.cx, componentsY: c.cy });
    expect(isValidBlurHash(hash)).toBe(true);
    expect(hash.length).toBe(c.hash.length);
    expect(error(hash, c, pixels)).toBeLessThanOrEqual(error(c.hash, c, pixels) + 0.01);
  });
  it('defaults to 4 by 3 components', () => {
    const c = expected.solid as Case;
    expect(encodeBlurHash(pictures.solid as Uint8ClampedArray, c.w, c.h)).toBe(c.hash);
  });
  it('accepts plain number arrays, and punch makes the contrast stronger', () => {
    const c = expected.checker as Case;
    const plain = Array.from(pictures.checker as Uint8ClampedArray);
    const hash = encodeBlurHash(plain, c.w, c.h, { componentsX: c.cx, componentsY: c.cy });
    const soft = decodeBlurHash(hash, 8, 8, 1);
    const hard = decodeBlurHash(hash, 8, 8, 2);
    expect(Array.from(hard)).not.toEqual(Array.from(soft));
  });
});

describe('BlurHash guards', () => {
  it('refuses bad sizes and component counts', () => {
    const p = pictures.solid as Uint8ClampedArray;
    expect(() => encodeBlurHash(p, 8, 8, { componentsX: 0 })).toThrow(RangeError);
    expect(() => encodeBlurHash(p, 8, 8, { componentsX: 10 })).toThrow(RangeError);
    expect(() => encodeBlurHash(p, 8, 8, { componentsY: 0 })).toThrow(RangeError);
    expect(() => encodeBlurHash(p, 8, 8, { componentsY: 10 })).toThrow(RangeError);
    expect(() => encodeBlurHash(p, 0, 8)).toThrow(RangeError);
    expect(() => encodeBlurHash(p, 8, 0)).toThrow(RangeError);
    expect(() => encodeBlurHash(p, 9, 8)).toThrow(RangeError);
  });
  it('knows a valid hash from a malformed one', () => {
    const good = (expected.gradient as Case).hash;
    expect(isValidBlurHash(good)).toBe(true);
    expect(isValidBlurHash('')).toBe(false);
    expect(isValidBlurHash('short')).toBe(false);
    expect(isValidBlurHash(`${good}x`)).toBe(false);
    expect(isValidBlurHash(good.slice(1))).toBe(false);
    expect(isValidBlurHash(`${good.slice(0, 5)} ${good.slice(6)}`)).toBe(false);
  });
  it('refuses to decode or average a malformed hash', () => {
    expect(() => decodeBlurHash('nonsense!', 4, 4)).toThrow(RangeError);
    expect(() => blurHashAverageColor('nonsense!')).toThrow(RangeError);
  });
  it('reads the average colour straight from the hash', () => {
    expect(blurHashAverageColor((expected.black as Case).hash)).toBe('rgb(0, 0, 0)');
    expect(blurHashAverageColor((expected.solid as Case).hash)).toBe('rgb(200, 40, 90)');
  });
});

describe('blurHash on an upload', () => {
  const upload = {
    path: 'courses/git/media/abc123.png',
    bytes: 1000,
    contentType: 'image/png',
    name: 'shot.png',
  } as const;
  const withUpload = (extra: object) => {
    const c = makeCourse();
    const lesson = c.chapters[0]?.items[0];
    if (lesson?.type !== 'lesson') throw new Error('fixture');
    lesson.blocks = [
      {
        type: 'image',
        id: 'i',
        url: 'https://x.test/a.png',
        alt: 'a',
        upload: { ...upload, ...extra },
      },
    ] as typeof lesson.blocks;
    return c;
  };
  it('is optional, and valid when present', () => {
    expect(courseSchema.safeParse(withUpload({})).success).toBe(true);
    const blurHash = (expected.gradient as Case).hash;
    expect(courseSchema.safeParse(withUpload({ blurHash })).success).toBe(true);
  });
  it('refuses a string that is not a BlurHash, or one that is far too long', () => {
    expect(courseSchema.safeParse(withUpload({ blurHash: 'not a hash' })).success).toBe(false);
    expect(courseSchema.safeParse(withUpload({ blurHash: 'A'.repeat(121) })).success).toBe(false);
  });
});
