import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-02',
  id: 'MED-09',
  title: 'A photo that is too big can be shrunk in one click before it uploads',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'A phone photo is several megabytes and thousands of pixels wide, so the upload check refused ' +
    'it and the Educator had to leave Studio, find a tool and come back. Now the same screen can ' +
    'make a lesson-sized copy, and nothing leaves the browser until the Educator is happy with it.',
  detail: [
    'When an image is refused only because it is too big or too wide, the message offers Shrink it for me next to the coding-agent prompt.',
    'It redraws the picture as WebP in the browser, at most 1600 px on the long side, at the best quality that fits the size limit. Transparency stays.',
    'The result is previewed in the lesson at the chosen layout, with the saving (for example 1.8 MB to 180 KB). Upload image sends it; Discard and choose another drops it.',
    'Location and camera details are removed from the new file. If the browser cannot do it, or the picture cannot get small enough, the message says so and the prompt is still there.',
    'PDFs, SVGs and anything that is not a real WebP, PNG or JPEG never get the button.',
  ],
} satisfies ChangelogEntry;
