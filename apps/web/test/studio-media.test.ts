import { uploadPolicy } from '@gurukul/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '../src/studio/media/clipboard';
import { SHRINK_GUIDE_URL, uploadFailureMessage } from '../src/studio/media/failure';
import { browserDecode, inspectImage } from '../src/studio/media/inspect';
import {
  MEDIA_CACHE_CONTROL,
  imageMetadata,
  mediaPath,
  newMediaId,
} from '../src/studio/media/path';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
]);

describe('inspectImage', () => {
  it('reads the first 16 bytes and the pixels, and checks them against the policy', async () => {
    const file = new File([PNG, new Uint8Array(100)], 'a.png', { type: 'image/png' });
    const slice = vi.spyOn(file, 'slice');
    const decode = vi.fn().mockResolvedValue({ width: 1200, height: 700 });
    const { candidate, check } = await inspectImage(file, uploadPolicy(), decode);
    expect(slice).toHaveBeenCalledWith(0, 16);
    expect(candidate).toMatchObject({
      name: 'a.png',
      size: 116,
      type: 'image/png',
      width: 1200,
      height: 700,
    });
    expect(candidate.head).toEqual(PNG);
    expect(check).toMatchObject({ ok: true, kind: 'image' });
  });

  it('has no pixel size when the file cannot be decoded, and says so', async () => {
    const file = new File([PNG], 'a.png', { type: 'image/png' });
    const { candidate, check } = await inspectImage(file, uploadPolicy(), async () => null);
    expect('width' in candidate).toBe(false);
    expect(check.problems.map((p) => p.code)).toEqual(['pixels']);
  });
});

describe('browserDecode', () => {
  it('reads the size from createImageBitmap and frees the bitmap', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 30, height: 20, close }));
    expect(await browserDecode(new Blob(['x']))).toEqual({ width: 30, height: 20 });
    expect(close).toHaveBeenCalledOnce();
  });

  it('is null for a file the browser cannot decode', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad')));
    expect(await browserDecode(new Blob(['x']))).toBeNull();
  });

  describe('without createImageBitmap, through an image element', () => {
    const run = async (outcome: 'load' | 'error') => {
      vi.stubGlobal('createImageBitmap', undefined);
      const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
      const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      class FakeImage {
        naturalWidth = 640;
        naturalHeight = 480;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_url: string) {
          queueMicrotask(() => (outcome === 'load' ? this.onload : this.onerror)?.());
        }
      }
      vi.stubGlobal('Image', FakeImage);
      const size = await browserDecode(new Blob(['x']));
      expect(create).toHaveBeenCalledOnce();
      expect(revoke).toHaveBeenCalledWith('blob:x');
      return size;
    };
    it('reads the natural size', async () => {
      expect(await run('load')).toEqual({ width: 640, height: 480 });
    });
    it('is null when the image does not load', async () => {
      expect(await run('error')).toBeNull();
    });
  });
});

describe('copyText', () => {
  it('uses the Clipboard API when the page may', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyText('hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to the copy command, and cleans up its field', async () => {
    vi.stubGlobal('navigator', {});
    let copied = '';
    document.execCommand = vi.fn(() => {
      copied = (document.querySelector('textarea') as HTMLTextAreaElement).value;
      return true;
    });
    expect(await copyText('hello')).toBe(true);
    expect(copied).toBe('hello');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('says false when the command fails or throws', async () => {
    vi.stubGlobal('navigator', {});
    document.execCommand = vi.fn().mockReturnValue(false);
    expect(await copyText('x')).toBe(false);
    document.execCommand = vi.fn(() => {
      throw new Error('blocked');
    });
    expect(await copyText('x')).toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});

describe('media paths', () => {
  it('makes a 22 character URL-safe id from 128 random bits', () => {
    const id = newMediaId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newMediaId()).not.toBe(id);
  });

  it('encodes the bytes it is given, with no padding and no + or /', () => {
    expect(newMediaId((b) => b.fill(0xfb))).toBe('-_v7-_v7-_v7-_v7-_v7-w');
    expect(newMediaId((b) => b.fill(0))).toBe('AAAAAAAAAAAAAAAAAAAAAA');
  });

  it('puts a file under its course with the extension of its type', () => {
    expect(mediaPath('git', 'abc', 'image/webp')).toBe('courses/git/media/abc.webp');
    expect(mediaPath('git', 'abc', 'image/png')).toBe('courses/git/media/abc.png');
    expect(mediaPath('git', 'abc', 'image/jpeg')).toBe('courses/git/media/abc.jpg');
  });

  it('records who, which course and the size, never the file name', () => {
    expect(
      imageMetadata({
        contentType: 'image/png',
        uid: 'u1',
        courseId: 'git',
        width: 10,
        height: 20,
      }),
    ).toEqual({
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
      customMetadata: { uploadedBy: 'u1', courseId: 'git', width: '10', height: '20' },
    });
    expect(MEDIA_CACHE_CONTROL).toContain('immutable');
  });
});

describe('uploadFailureMessage', () => {
  it('says what to do for each kind of failure, from the code and not the error text', () => {
    const message = (code: unknown, online = true) => uploadFailureMessage({ code }, online);
    expect(message('storage/unauthorized')).toMatch(/not be an Educator/);
    expect(message('storage/network-request-failed')).toMatch(/connection/);
    expect(message('storage/quota-exceeded')).toMatch(/storage space/);
    expect(message('storage/whatever')).toMatch(/Try again/);
    expect(message(undefined, false)).toMatch(/connection/);
    expect(uploadFailureMessage(null, true)).toMatch(/Try again/);
    expect(uploadFailureMessage(new Error('secret path courses/x'), true)).not.toMatch(/secret/);
  });

  it('reads whether the browser is online by default', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(uploadFailureMessage({})).toMatch(/connection/);
  });

  it('links the Educator guide section', () => {
    expect(SHRINK_GUIDE_URL).toMatch(/docs\/educator\.md#shrink-an-image-by-hand$/);
  });
});
