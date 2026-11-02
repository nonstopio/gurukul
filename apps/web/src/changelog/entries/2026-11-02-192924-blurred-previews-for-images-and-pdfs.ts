import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-02',
  id: 'MED-12',
  title: 'Uploaded images and PDFs show a soft blurred preview while they load',
  area: 'LEARN',
  kind: 'feature',
  why:
    'On a slow connection a lesson picture arrived as a blank gap that then pushed the text down, ' +
    'and an uploaded PDF was only a grey link. Studio now keeps a 30-character summary of each ' +
    'upload, so the page holds the picture’s exact place with its colours from the first ' +
    'moment, fades to the real image when it arrives, and a PDF link carries a tiny blurred ' +
    'first page. Nothing for the Educator to do, and a PDF that cannot be previewed still uploads.',
  detail: [
    'Studio makes the preview when the file uploads: an image is drawn small in the browser, a PDF has its first page drawn there with pdf.js, which loads only when a PDF is picked.',
    'Learners see it behind an uploaded image at the image’s own shape until it has loaded, then it fades out (it just disappears for people who ask for less motion). It is decoration: screen readers skip it.',
    'An uploaded File block shows the blurred first page beside its label; the "Label · PDF · 420 KB" text is unchanged.',
    'Linked images get no preview, since the browser cannot read another site’s pixels. Older uploads read unchanged.',
  ],
} satisfies ChangelogEntry;
