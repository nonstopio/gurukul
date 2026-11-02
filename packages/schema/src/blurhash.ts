/**
 * BlurHash (https://blurha.sh, MIT): a 20 to 30 character string that decodes to a soft, blurred
 * version of an image. Studio computes one when a file is uploaded; the player decodes it to a tiny
 * picture shown while the real file loads, so the page never flashes empty. Pure and
 * dependency-free: it takes and returns plain RGBA bytes, so the browser draws them on a canvas.
 */

const BASE83 =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
const MAX_COMPONENTS = 9;

export interface BlurHashOptions {
  /** Detail across and down, 1 to 9 each. Default 4 by 3. */
  componentsX?: number;
  componentsY?: number;
}

const sign = (n: number) => (n < 0 ? -1 : 1);
const signPow = (value: number, exp: number) => sign(value) * Math.abs(value) ** exp;

const toLinear = (value: number): number => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const toSrgb = (value: number): number => {
  const v = Math.max(0, Math.min(1, value));
  return v <= 0.0031308
    ? Math.trunc(v * 12.92 * 255 + 0.5)
    : Math.trunc((1.055 * v ** (1 / 2.4) - 0.055) * 255 + 0.5);
};

function encode83(value: number, length: number): string {
  let out = '';
  for (let i = 1; i <= length; i++) {
    out += BASE83.charAt(Math.floor(value / 83 ** (length - i)) % 83);
  }
  return out;
}

function decode83(text: string): number {
  let value = 0;
  for (const c of text) value = value * 83 + BASE83.indexOf(c);
  return value;
}

type Rgb = [number, number, number];

/** True when `hash` is a well-formed BlurHash: the right characters and the length its size flag implies. */
export function isValidBlurHash(hash: string): boolean {
  if (hash.length < 6 || [...hash].some((c) => !BASE83.includes(c))) return false;
  const flag = decode83(hash.charAt(0));
  const numY = Math.floor(flag / 9) + 1;
  const numX = (flag % 9) + 1;
  return hash.length === 4 + 2 * numX * numY;
}

/**
 * Encodes RGBA `pixels` (`width * height * 4` bytes, as `ImageData.data`) into a BlurHash. Downscale
 * a large picture to about 32 px on its long side first: the hash only keeps low frequencies, so the
 * result is the same and the loop is a thousand times cheaper.
 */
export function encodeBlurHash(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  options: BlurHashOptions = {},
): string {
  const cx = options.componentsX ?? 4;
  const cy = options.componentsY ?? 3;
  if (cx < 1 || cx > MAX_COMPONENTS || cy < 1 || cy > MAX_COMPONENTS)
    throw new RangeError('BlurHash components must be between 1 and 9');
  if (width < 1 || height < 1 || pixels.length !== width * height * 4)
    throw new RangeError('BlurHash needs width * height RGBA pixels');

  const factors: Rgb[] = [];
  for (let y = 0; y < cy; y++) {
    for (let x = 0; x < cx; x++) {
      const normalisation = x === 0 && y === 0 ? 1 : 2;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const basis =
            normalisation *
            Math.cos((Math.PI * x * px) / width) *
            Math.cos((Math.PI * y * py) / height);
          const i = 4 * (px + py * width);
          r += basis * toLinear(Number(pixels[i]));
          g += basis * toLinear(Number(pixels[i + 1]));
          b += basis * toLinear(Number(pixels[i + 2]));
        }
      }
      const scale = 1 / (width * height);
      factors.push([r * scale, g * scale, b * scale]);
    }
  }

  const [dc, ...ac] = factors as [Rgb, ...Rgb[]];
  let hash = encode83(cx - 1 + (cy - 1) * 9, 1);
  let maximum = 1;
  if (ac.length > 0) {
    const actual = Math.max(
      ...ac.map((f) => Math.max(Math.abs(f[0]), Math.abs(f[1]), Math.abs(f[2]))),
    );
    const quantised = Math.max(0, Math.min(82, Math.floor(actual * 166 - 0.5)));
    maximum = (quantised + 1) / 166;
    hash += encode83(quantised, 1);
  } else {
    hash += encode83(0, 1);
  }
  hash += encode83((toSrgb(dc[0]) << 16) + (toSrgb(dc[1]) << 8) + toSrgb(dc[2]), 4);
  const quant = (v: number) =>
    Math.max(0, Math.min(18, Math.floor(signPow(v / maximum, 0.5) * 9 + 9.5)));
  for (const f of ac) hash += encode83(quant(f[0]) * 361 + quant(f[1]) * 19 + quant(f[2]), 2);
  return hash;
}

/**
 * Decodes a BlurHash into RGBA bytes for a `width` by `height` picture (32 by 32 is plenty: the
 * browser scales it up and it stays soft). Throws `RangeError` on a malformed hash, so callers that
 * read stored data check `isValidBlurHash` first.
 */
export function decodeBlurHash(
  hash: string,
  width: number,
  height: number,
  punch = 1,
): Uint8ClampedArray {
  if (!isValidBlurHash(hash)) throw new RangeError('Not a valid BlurHash');
  const flag = decode83(hash.charAt(0));
  const numY = Math.floor(flag / 9) + 1;
  const numX = (flag % 9) + 1;
  const maximum = ((decode83(hash.charAt(1)) + 1) / 166) * punch;

  const colors: Rgb[] = [];
  const dc = decode83(hash.slice(2, 6));
  colors.push([toLinear(dc >> 16), toLinear((dc >> 8) & 255), toLinear(dc & 255)]);
  for (let i = 1; i < numX * numY; i++) {
    const v = decode83(hash.slice(4 + i * 2, 6 + i * 2));
    const channel = (q: number) => signPow((q - 9) / 9, 2) * maximum;
    colors.push([channel(Math.floor(v / 361)), channel(Math.floor(v / 19) % 19), channel(v % 19)]);
  }

  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < numY; j++) {
        for (let i = 0; i < numX; i++) {
          const basis = Math.cos((Math.PI * x * i) / width) * Math.cos((Math.PI * y * j) / height);
          const color = colors[i + j * numX] as Rgb;
          r += color[0] * basis;
          g += color[1] * basis;
          b += color[2] * basis;
        }
      }
      const at = 4 * (x + y * width);
      pixels[at] = toSrgb(r);
      pixels[at + 1] = toSrgb(g);
      pixels[at + 2] = toSrgb(b);
      pixels[at + 3] = 255;
    }
  }
  return pixels;
}

/**
 * The average colour of a BlurHash as `rgb(r, g, b)`: what the player paints behind an image whose
 * hash it cannot or need not decode (it is in the first four characters after the size and max).
 */
export function blurHashAverageColor(hash: string): string {
  if (!isValidBlurHash(hash)) throw new RangeError('Not a valid BlurHash');
  const dc = decode83(hash.slice(2, 6));
  return `rgb(${dc >> 16}, ${(dc >> 8) & 255}, ${dc & 255})`;
}
