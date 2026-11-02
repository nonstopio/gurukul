import { z } from 'zod';
import { isValidBlurHash } from './blurhash';

/**
 * The upload policy for lesson media (`.plan/19-course-media-uploads.md`): which files Studio may
 * upload and how big they may be. Defined once, here. The browser check, the "too big" guidance,
 * the coding-agent prompt and the Storage rules tests all read it, so they cannot disagree.
 */

const KB = 1024;

/** The largest any single upload may be, whatever an Admin configures. Also written into `storage.rules`. */
export const UPLOAD_HARD_CEILING_KB = 1024;
/** The smallest limit an Admin may set: lower than this refuses almost every real image. */
export const UPLOAD_MIN_LIMIT_KB = 50;
export const DEFAULT_IMAGE_MAX_KB = 500;
export const DEFAULT_PDF_MAX_KB = 1024;

/** The longest side an image may have, and the width Studio recommends and warns under. */
export const IMAGE_MAX_LONG_EDGE = 2000;
export const IMAGE_RECOMMENDED_LONG_EDGE = 1600;
export const IMAGE_WARN_BELOW_WIDTH = 800;

export const IMAGE_CONTENT_TYPES = ['image/webp', 'image/png', 'image/jpeg'] as const;
export const PDF_CONTENT_TYPE = 'application/pdf' as const;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];
export type UploadKind = 'image' | 'pdf';

/** What each accepted file extension must be declared as. */
const EXTENSION_TYPES: Readonly<Record<string, ImageContentType | typeof PDF_CONTENT_TYPE>> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  pdf: PDF_CONTENT_TYPE,
};

/** `config/org.uploads`: the limits an Admin may lower. Missing reads as the defaults. */
export const uploadLimitsSchema = z.object({
  imageMaxKB: z.number().int().min(UPLOAD_MIN_LIMIT_KB).max(UPLOAD_HARD_CEILING_KB),
  pdfMaxKB: z.number().int().min(UPLOAD_MIN_LIMIT_KB).max(UPLOAD_HARD_CEILING_KB),
});
export type UploadLimits = z.infer<typeof uploadLimitsSchema>;

export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  imageMaxKB: DEFAULT_IMAGE_MAX_KB,
  pdfMaxKB: DEFAULT_PDF_MAX_KB,
};

export interface UploadPolicy {
  image: {
    contentTypes: readonly ImageContentType[];
    extensions: readonly string[];
    maxBytes: number;
    maxLongEdge: number;
    recommendedLongEdge: number;
    warnBelowWidth: number;
  };
  pdf: { contentType: typeof PDF_CONTENT_TYPE; extensions: readonly string[]; maxBytes: number };
  /** No file may be bigger than this, whatever the limits say. */
  hardCeilingBytes: number;
}

/**
 * The live policy for an organisation's limits (`config/org.uploads`, or nothing for the defaults).
 * A limit is held between the minimum and the hard ceiling, so a bad stored value cannot open the gate.
 */
export function uploadPolicy(limits?: Partial<UploadLimits>): UploadPolicy {
  const bytes = (kb: number | undefined, fallback: number) =>
    Math.min(Math.max(kb ?? fallback, UPLOAD_MIN_LIMIT_KB), UPLOAD_HARD_CEILING_KB) * KB;
  return {
    image: {
      contentTypes: IMAGE_CONTENT_TYPES,
      extensions: ['webp', 'png', 'jpg', 'jpeg'],
      maxBytes: bytes(limits?.imageMaxKB, DEFAULT_IMAGE_MAX_KB),
      maxLongEdge: IMAGE_MAX_LONG_EDGE,
      recommendedLongEdge: IMAGE_RECOMMENDED_LONG_EDGE,
      warnBelowWidth: IMAGE_WARN_BELOW_WIDTH,
    },
    pdf: {
      contentType: PDF_CONTENT_TYPE,
      extensions: ['pdf'],
      maxBytes: bytes(limits?.pdfMaxKB, DEFAULT_PDF_MAX_KB),
    },
    hardCeilingBytes: UPLOAD_HARD_CEILING_KB * KB,
  };
}

/** `1.8 MB`, `420 KB`, `900 B`: sizes the way people read them. */
export function formatBytes(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < KB * KB) return `${Math.round(bytes / KB)} KB`;
  return `${(bytes / (KB * KB)).toFixed(1)} MB`;
}

/** The type a file's first bytes say it is, or null when they match none we accept. */
export function sniffContentType(
  head: Uint8Array,
): ImageContentType | typeof PDF_CONTENT_TYPE | null {
  const at = (offset: number, text: string) =>
    [...text].every((c, i) => head[offset + i] === c.charCodeAt(0));
  if (head[0] === 0x89 && at(1, 'PNG\r\n') && head[6] === 0x1a && head[7] === 0x0a)
    return 'image/png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
  if (at(0, '%PDF-')) return PDF_CONTENT_TYPE;
  return null;
}

/** The part of a file name after its last dot, lower-cased; empty when there is none. */
const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

/** What the browser knows about a picked file before anything uploads. */
export interface UploadCandidate {
  name: string;
  size: number;
  /** The type the browser declares (`File.type`). */
  type: string;
  /** The file's first 16 bytes or more. */
  head: Uint8Array;
  /** Decoded pixel size of an image; absent when it could not be read. */
  width?: number;
  height?: number;
}

export type UploadProblemCode = 'type' | 'extension' | 'signature' | 'size' | 'pixels';

export interface UploadProblem {
  code: UploadProblemCode;
  /** In words an Educator understands, with the actual numbers. */
  message: string;
}

export interface UploadCheck {
  /** What the file is, from its extension; null when the extension is not one we accept. */
  kind: UploadKind | null;
  ok: boolean;
  problems: UploadProblem[];
  /** The file may upload, but the Educator should hear this first (a narrow image). */
  warnings: string[];
  /** A PDF that is too big: point to GitHub or Google Drive links instead of shrinking. */
  suggestLink: boolean;
}

const ACCEPTED = 'WebP, PNG or JPEG images and PDF files';

/**
 * Checks a picked file against the policy: type (extension, declared type and first bytes), size
 * and, for an image, pixels. Pure, so the same check runs in the browser and in tests. A refused
 * file says what was wrong in numbers; nothing has uploaded yet.
 */
export function checkUpload(policy: UploadPolicy, file: UploadCandidate): UploadCheck {
  const expected = EXTENSION_TYPES[extensionOf(file.name)];
  if (expected === undefined) {
    return {
      kind: null,
      ok: false,
      problems: [
        {
          code: 'type',
          message: `"${file.name}" is not a type Gurukul accepts. Only ${ACCEPTED} can be uploaded.`,
        },
      ],
      warnings: [],
      suggestLink: false,
    };
  }
  const kind: UploadKind = expected === PDF_CONTENT_TYPE ? 'pdf' : 'image';
  const noun = kind === 'pdf' ? 'PDF' : 'image';
  const problems: UploadProblem[] = [];
  const warnings: string[] = [];

  const declared = file.type;
  const accepted: readonly string[] =
    kind === 'pdf' ? [policy.pdf.contentType] : policy.image.contentTypes;
  if (!accepted.includes(declared)) {
    problems.push({
      code: 'type',
      message: `This file says it is "${declared || 'unknown'}", which Gurukul does not accept for a ${noun}.`,
    });
  } else if (declared !== expected) {
    problems.push({
      code: 'extension',
      message: `The file name ends in .${extensionOf(file.name)} but the file is ${declared}. Rename it or export it again.`,
    });
  }
  if (sniffContentType(file.head) !== expected) {
    problems.push({
      code: 'signature',
      message: `This does not look like a real ${noun}: its contents are not ${expected}. A renamed file does not count; export it as ${noun === 'PDF' ? 'a PDF' : 'WebP, PNG or JPEG'}.`,
    });
  }

  const pixels =
    file.width !== undefined && file.height !== undefined
      ? ` and ${file.width} × ${file.height} px`
      : '';
  const limit = kind === 'pdf' ? policy.pdf.maxBytes : policy.image.maxBytes;
  let suggestLink = false;
  if (file.size > limit) {
    suggestLink = kind === 'pdf';
    problems.push({
      code: 'size',
      message:
        kind === 'pdf'
          ? `This PDF is ${formatBytes(file.size)}. PDFs can be up to ${formatBytes(limit)}. Put larger files on GitHub or Google Drive (shared with nonstopio.com) and add the link with Link instead.`
          : `This image is ${formatBytes(file.size)}${pixels}. Images can be up to ${formatBytes(limit)} and ${policy.image.maxLongEdge} px on the long side. Shrink it to ${policy.image.recommendedLongEdge} px wide as WebP and it will look just as sharp in the lesson.`,
    });
  }

  if (kind === 'image') {
    if (file.width === undefined || file.height === undefined) {
      problems.push({
        code: 'pixels',
        message: 'This image could not be read, so its size in pixels is unknown. Export it again.',
      });
    } else {
      const longEdge = Math.max(file.width, file.height);
      if (longEdge > policy.image.maxLongEdge) {
        problems.push({
          code: 'pixels',
          message: `This image is ${file.width} × ${file.height} px. The long side can be at most ${policy.image.maxLongEdge} px; ${policy.image.recommendedLongEdge} px is ideal.`,
        });
      }
      if (file.width < policy.image.warnBelowWidth) {
        warnings.push(
          `This image is only ${file.width} px wide, so it will look soft at full width on a sharp screen. Choose the Small or Medium layout.`,
        );
      }
    }
  }

  return { kind, ok: problems.length === 0, problems, warnings, suggestLink };
}

/** A file name safe to put in a prompt: no quotes or control characters, at most 120 characters. */
function promptName(name: string): string {
  const cleaned = [...name]
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || '"`\\'.includes(c) ? ' ' : c))
    .join('');
  return cleaned.replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';
}

/** What `shrinkPrompt` needs to know about the file the Educator picked. */
export interface ShrinkTarget {
  kind: UploadKind;
  name: string;
  size: number;
  width?: number;
  height?: number;
}

/**
 * A prompt to paste into any coding agent (Claude Code, Cursor, Copilot, …) that shrinks the picked
 * file to fit. Built from the live policy, so it never disagrees with the limits.
 */
export function shrinkPrompt(policy: UploadPolicy, file: ShrinkTarget): string {
  const name = promptName(file.name);
  const stem = promptName(file.name.replace(/\.[^.]*$/, ''));
  const input = (extra: string) => `Input file: "${name}" (currently ${extra}).`;
  if (file.kind === 'pdf') {
    return [
      'I need to shrink a PDF for NonStop Gurukul, our learning platform. Requirements:',
      `- File size: under ${formatBytes(policy.pdf.maxBytes)}`,
      '- Keep the text selectable (do not turn pages into pictures)',
      '- Downsample images to about 150 dpi (for example Ghostscript `-dPDFSETTINGS=/ebook`)',
      '- Strip metadata (author, creator, document properties)',
      input(formatBytes(file.size)),
      'Use whatever is available on this machine; do not upload the file to any online service.',
      `Write the result next to the original as "${stem}-gurukul.pdf", then tell me its final size.`,
      'If you cannot get it under the limit, say so and recommend putting it on GitHub or Google Drive (shared with nonstopio.com) and linking it instead.',
    ].join('\n');
  }
  const { image } = policy;
  const maxKB = Math.round(image.maxBytes / KB);
  const pixels =
    file.width !== undefined && file.height !== undefined
      ? `${formatBytes(file.size)}, ${file.width} × ${file.height} px`
      : formatBytes(file.size);
  return [
    'I need to shrink an image for NonStop Gurukul, our learning platform. Requirements:',
    '- Output format: WebP (PNG only if it must stay lossless, e.g. a pixel-exact diagram; JPEG also accepted)',
    `- Longest side: ${image.recommendedLongEdge} px (never more than ${image.maxLongEdge} px); keep the aspect ratio; never upscale`,
    `- File size: under ${formatBytes(image.maxBytes)} (aim for ${Math.round(maxKB * 0.2)}–${Math.round(maxKB * 0.6)} KB)`,
    '- Quality: WebP quality 80–85; for screenshots with text, check the text is still crisp',
    '- Strip metadata (EXIF, GPS location, camera details)',
    '- Not accepted: SVG, GIF, AVIF, HEIC, TIFF, BMP',
    input(pixels),
    'Use whatever is available on this machine (for example sharp, ImageMagick `magick`, `cwebp`, or `sips` on macOS); do not upload the file to any online service.',
    `Write the result next to the original as "${stem}-gurukul.webp", then tell me its final size and pixel dimensions.`,
  ].join('\n');
}

/** Where an uploaded file lives: `courses/{courseId}/media/{mediaId}.{ext}`. */
export const UPLOAD_PATH = /^courses\/[a-z0-9]+(?:-[a-z0-9]+)*\/media\/[A-Za-z0-9_-]+\.[a-z]+$/;

const uploadBase = {
  path: z.string().max(300).regex(UPLOAD_PATH),
  bytes: z
    .number()
    .int()
    .positive()
    .max(UPLOAD_HARD_CEILING_KB * KB),
  /** What the Educator sees; never part of the path (a file name can carry personal data). */
  name: z.string().max(120),
  /**
   * A BlurHash of the image (or of a PDF's first page), made in the browser at upload: the player
   * shows it, softly, while the file loads. Optional, so older uploads read unchanged.
   */
  blurHash: z.string().max(120).refine(isValidBlurHash, 'not a valid BlurHash').optional(),
};

/** `upload` on an Image block: "we host this". */
export const imageUploadSchema = z.object({
  ...uploadBase,
  contentType: z.enum(IMAGE_CONTENT_TYPES),
});
export type ImageUpload = z.infer<typeof imageUploadSchema>;

/** `upload` on a File block: a PDF we host. */
export const fileUploadSchema = z.object({
  ...uploadBase,
  contentType: z.literal(PDF_CONTENT_TYPE),
});
export type FileUpload = z.infer<typeof fileUploadSchema>;

/**
 * True when `url` is a Firebase Storage download URL for exactly `path` (and `bucket`, when given).
 * Publishing checks this so an uploaded block cannot point at someone else's file. `emulatorHost`
 * (`127.0.0.1:9199`) also accepts the plain-http address the local Storage emulator hands out; only
 * the emulator runs pass it, never production.
 */
export function isDownloadUrlFor(
  url: string,
  path: string,
  bucket?: string,
  emulatorHost?: string,
): boolean {
  try {
    const u = new URL(url);
    const m = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(u.pathname);
    const origin =
      u.protocol === 'https:'
        ? u.hostname === 'firebasestorage.googleapis.com'
        : emulatorHost !== undefined && u.protocol === 'http:' && u.host === emulatorHost;
    return (
      origin &&
      m !== null &&
      (bucket === undefined || m[1] === bucket) &&
      decodeURIComponent(String(m[2])) === path
    );
  } catch {
    return false;
  }
}
