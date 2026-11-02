import type { ChangelogEntry } from '../types';

export default {
  date: '2026-11-02',
  id: 'MED-08',
  title:
    'Educators can reuse an image already uploaded to the course, and see uploads in the Media library',
  area: 'STUDIO',
  kind: 'feature',
  why:
    'The same diagram often belongs in several lessons, and the only way to show it twice was to ' +
    'upload it twice, which stored the file again and let the copies drift apart. Reusing the ' +
    'file keeps one picture, one size and one place to look when it needs replacing.',
  detail: [
    "The Image block has Choose from this course's media: it lists the images uploaded in this course, with a thumbnail, name, size and pixels. Pick one and the block shows that file, with no new upload. Write its alt text for the lesson.",
    "Only this course's own uploads are offered. To reuse an image from another course, copy its address from the Media library and paste it in Link.",
    'The Media library has an Uploaded type that shows only the files Gurukul hosts, and each uploaded file is tagged Uploaded with its size. Links work as before.',
  ],
} satisfies ChangelogEntry;
