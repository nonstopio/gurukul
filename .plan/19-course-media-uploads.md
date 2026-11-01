# 19 · Course media uploads (images and PDFs)

Educators can upload an **image** or a **PDF** into a lesson from Studio, preview it, choose how
it sits on the page, and publish it. Learners who may open the course see it. Everything else
(videos, large files, other file types) stays a link, as in v1.

Status: planned, not built. Tracker section **Course media uploads** (`MED-*`).

## What changes, in one paragraph

Today an Image block and a File block hold only an address, so an Educator has to host the file
somewhere else first. With this plan the same two blocks gain an **Upload** choice beside
**Link**. The browser checks the file against a small published policy (type, size, pixel size),
and if it fails says exactly why and how to fix it, including a ready-made prompt to paste into any
coding agent that shrinks the file to fit. A file that passes uploads straight from the browser to
Cloud Storage for Firebase, guarded by Storage security rules; the block then stores the file's
download address, so the player renders it exactly like a linked image or file today.

## The upload policy

One policy, defined once in `@gurukul/schema` (`uploadPolicy`), used by the Studio check, the
guidance text, the agent prompt and the Storage rules tests. The **limits** are configurable by an
Admin (see [Configurable limits](#configurable-limits)); the **types** are not.

| Kind  | Accepted types                                     | Default size limit | Hard ceiling | Pixels                                             |
| ----- | -------------------------------------------------- | ------------------ | ------------ | -------------------------------------------------- |
| Image | `image/webp`, `image/png`, `image/jpeg` (`.webp`, `.png`, `.jpg`, `.jpeg`) | **500 KB**         | 1 MB         | long edge at most **2000 px**; recommended **1600 px**; warn under 800 px wide |
| PDF   | `application/pdf` (`.pdf`)                         | **1 MB**           | 1 MB         | —                                                  |

Not accepted, and why:

- **SVG**: it can carry script, and an uploaded SVG opened directly runs on the Storage domain.
  Export it to PNG or WebP.
- **GIF** and animated images: a few seconds of animation is several MB. A screen recording
  belongs on YouTube (unlisted) or Loom, as a Video block.
- **AVIF, HEIC, TIFF, BMP**: inconsistent support in browsers or in Educators' tools. Convert to WebP.
- **Office files, ZIPs, code archives**: link them from GitHub or Google Drive with a File block.
- **Video and audio**: unchanged, still hosted links (`00-vision-and-scope.md`).

### Why these image numbers

The lesson column is 780 CSS px wide (`--width-reading`). A sharp image on a 2× (retina) screen
needs about 2 × 780 = **1560 device pixels**, so **1600 px on the long edge** is the sweet spot:
crisp on every laptop and phone, nothing wasted. 2000 px is allowed for detailed diagrams, which
also open full size (see [Layouts](#layouts)). Below 800 px wide an image looks soft at full column
width on a retina screen; Studio warns and suggests the **Small** or **Medium** layout instead of
refusing, because a small logo or icon is legitimately small.

At 1600 px a WebP at quality 80–85 is typically **100–300 KB**, a screenshot often under 150 KB;
the same screenshot as PNG is 400 KB–1.5 MB. So **500 KB** leaves room for a detailed photo as WebP
or JPEG while refusing the unshrunk PNG export that would cost every learner a megabyte. The
policy is about bytes and pixels, not format: a small PNG is fine.

### Why 1 MB for PDFs

A text PDF (a cheat sheet, a handout, slides exported with compressed images) is well under 1 MB.
Anything larger is usually a scanned or image-heavy document, and those belong in **GitHub** (a
repository file or release) or **Google Drive** (shared with `nonstopio.com`), linked from a File
block. The File block's Link mode already supports both; the too-large message says so.

## When a file does not fit: guidance and the agent prompt

The check runs in the browser before anything uploads, so a refused file costs nothing. The
message says what was wrong in numbers and what to do, for example:

> **This image is 1.8 MB and 3024 × 4032 px.** Images can be up to 500 KB and 2000 px on the long
> side. Shrink it to 1600 px wide as WebP and it will look just as sharp in the lesson.
> [Copy a prompt for your coding agent] [How to shrink it by hand]

For a PDF over the limit:

> **This PDF is 3.4 MB.** PDFs can be up to 1 MB. Put larger files on GitHub or Google Drive
> (shared with nonstopio.com) and add the link with **Link** instead.
> [Copy a prompt for your coding agent] [Switch to Link]

**The prompt** is generated from the live policy (`shrinkPrompt(policy, file)` in
`@gurukul/schema`), so it never disagrees with the limits, and it names the file the Educator
picked. It works with any coding agent (Claude Code, Cursor, Copilot, …) that can run commands. The
image version reads:

```text
I need to shrink an image for NonStop Gurukul, our learning platform. Requirements:
- Output format: WebP (PNG only if it must stay lossless, e.g. a pixel-exact diagram; JPEG also accepted)
- Longest side: 1600 px (never more than 2000 px); keep the aspect ratio; never upscale
- File size: under 500 KB (aim for 100–300 KB)
- Quality: WebP quality 80–85; for screenshots with text, check the text is still crisp
- Strip metadata (EXIF, GPS location, camera details)
- Not accepted: SVG, GIF, AVIF, HEIC, TIFF, BMP
Input file: "<file name>" (currently <size>, <width> × <height> px).
Use whatever is available on this machine (for example sharp, ImageMagick `magick`, `cwebp`, or
`sips` on macOS); do not upload the file to any online service. Write the result next to the
original as "<name>-gurukul.webp", then tell me its final size and pixel dimensions.
```

The PDF version asks the agent to compress the PDF under 1 MB (for example Ghostscript
`-dPDFSETTINGS=/ebook`, images downsampled to 150 dpi), keep the text selectable, strip metadata,
and, if it still cannot get under 1 MB, to say so and recommend GitHub or Google Drive instead.

"How to shrink it by hand" links a short section in the Educator guide (`docs/`): Squoosh-style
browser tools, macOS Preview export, and the same numbers.

A later item (`MED-09`) adds **Shrink it for me** in the browser itself (canvas re-encode to WebP at
1600 px, no new dependency), so most Educators never need the prompt. The prompt stays for PDFs and
for people who want to batch-convert a folder.

## Where files live

- **Bucket**: the project's default Cloud Storage for Firebase bucket (a maintainer creates it;
  `MED-01`). Separate from the Firestore backup bucket.
- **Path**: `courses/{courseId}/media/{mediaId}.{ext}`, where `mediaId` is a random id made in the
  browser. A file is **never overwritten**: replacing an image uploads a new file, so a published
  version and a rollback keep pointing at the bytes they were published with.
- **Metadata** set on upload: `contentType`, `cacheControl: public, max-age=31536000, immutable`
  (safe because the name never changes), and custom metadata `uploadedBy` (uid), `courseId`,
  `width`, `height` (images). No original file name in the path (it can carry personal data);
  the block keeps a display name.
- **Address stored in the block**: the Firebase **download URL** (`getDownloadURL`), plus the
  Storage path, so tooling can find the file again.

### Who can read a file

Recommendation (open question 15): **download URLs**. A download URL carries an unguessable
token; it works in a plain `<img>` and `<a>`, the browser and Google's edge cache it, and it costs
no Firestore read per view. It reaches only people who can read the course document, because it
lives inside the course object, which the Firestore rules already gate (`canOpenCourse`).

The cost of that choice, stated plainly: anyone who is given the URL can open that one file without
signing in, the same as an unlisted YouTube video or a Drive link shared "with anyone who has the
link", which is what courses use today. Course content is internal training material, not learner
data, so this is acceptable. Uploads must not contain personal data (see [Content rules](#content-rules)).

Rejected alternative: Storage rules that check course access on every read. Each image view would
then cost one or two Firestore reads inside the rules (the course, and the person's profile for a
team-only course), images could not be plain `<img src>` (the app would fetch every file through
the SDK as a blob), and nothing would be cached across visits. At 200 learners that is real quota
for no real protection gain. If a course ever needs truly private files, that course links them
from a restricted Google Drive folder.

## Storage security rules

New file `firebase/storage.rules`, registered in `firebase.json`, deployed by `deploy.yml` with the
Firestore rules (the deploy service account's Firebase Rules Admin role already covers it).

- **Default deny** everything outside `courses/{courseId}/media/`.
- **Read** through the rules (SDK, no token): signed in with a verified `@nonstopio.com` account,
  same check as Firestore's `signedIn()`. Download URLs bypass rules by design (above).
- **Create** only when all hold:
  - signed in, verified `@nonstopio.com`, and the `educator` or `admin` claim;
  - an Admin, or the uid is in `courses/{courseId}.educatorIds` (one cross-service
    `firestore.get`, so one Firestore read per upload, not per view);
  - `request.resource.contentType` is one of the accepted types, and the extension matches it;
  - `request.resource.size` is at most the configured limit for that kind, read from
    `config/org.uploads` (a second `firestore.get`, cached within the request), falling back to the
    default when the field is missing, and never above the hard ceiling written into the rules;
  - the object does not exist yet (`resource == null`): no overwrite.
- **Update, delete**: never from a client. Clean-up is a function's job (`MED-10`).

Cross-service rules need the "Firebase Rules Firestore Service Agent" role granted once on the
project; the console offers it on the first deploy. That is part of the maintainer item `MED-01`.

The content type is what the browser declares. The browser also checks the file's first bytes
(PNG, JPEG, WebP, `%PDF-` signatures) before uploading, so an honest mistake (a renamed file) is
caught with a clear message. A determined Educator could still declare a false type; Educators are
trusted staff, files are served with their declared type and `X-Content-Type-Options: nosniff` by
Google, and SVG/HTML types are refused, so nothing uploaded can run script on our origin.

Tests: `firebase/storage-rules/` (or a `storage/` folder in `firebase/rules/`) against the Storage
emulator, with an allowed and a denied test for every condition above: wrong role, Educator not on
the course, Admin on any course, each wrong type, a mismatched extension, one byte over the
limit, a lowered Admin limit, the hard ceiling, an overwrite, a delete, a read signed out. The
rules coverage report is extended to `storage.rules`, so every expression is evaluated, as for
Firestore (`scripts/check-rules-coverage.mjs`). Storage emulator joins `firebase.json`
`emulators` (port 9199) and the e2e and rules jobs.

## Data model changes

Both changes are **optional fields** on existing blocks, so every existing course still reads and
validates unchanged. The `schemaVersion` bump to 4 is only needed if the strict reader rejects
unknown keys in practice; the implementer checks `readCourse` / `migrateCourse` and, if a bump is
needed, adds a no-op `v3→v4` step with its test (`02-data-model.md` Migrations).

```ts
type ImageBlock = {
  type: 'image'; id: string; url: string; alt: string; caption?: string;
  // new, all optional:
  layout?: 'column' | 'medium' | 'small';   // missing reads as 'column'
  zoom?: boolean;                           // click opens full size; missing reads as false
  border?: boolean;                         // a thin frame for screenshots on white; missing reads as true
  width?: number; height?: number;          // intrinsic pixels, so the page does not jump while it loads
  upload?: { path: string; bytes: number; contentType: 'image/webp' | 'image/png' | 'image/jpeg'; name: string };
};

type FileBlock = {
  type: 'file'; id: string; url: string; label: string;
  // new, optional:
  upload?: { path: string; bytes: number; contentType: 'application/pdf'; name: string };
};
```

- `upload` present means "we host this": Studio shows Replace instead of an address field, the
  Media library tags it **Uploaded**, and the clean-up job knows it is ours. `upload.name` is a
  display name the Educator can edit, at most 120 characters; it is never part of the path.
- `width` and `height` are also allowed on a linked image (Studio reads them from the loaded
  preview), so linked images stop shifting the page too.
- Publish validation (`packages/schema/src/draft.ts`) gains: an uploaded image's `url` must be a
  Firebase Storage download URL for this project's bucket and this course's path; an image needs
  alt text (as today); `upload.bytes` within the hard ceiling.

**`config/org.uploads`** (new key on the existing document, Admin only):

```ts
uploads?: { imageMaxKB: number; pdfMaxKB: number };  // missing reads as the defaults 500 / 1024
```

zod clamps each value to 50 ≤ value ≤ hard ceiling (image 1024, PDF 1024). The Firestore rule for
`config/org` adds `uploads` to the allowed keys, with the same bounds, writable by an Admin only
(Educators keep only `teams`).

### Configurable limits

The Admin console's Org settings gains an **Uploads** card: "Largest image (KB)" and "Largest PDF
(KB)", with the defaults shown and the hard ceiling as the maximum. Lowering a limit affects new
uploads only; files already uploaded stay. The Storage rules read the same field, so the browser
and the server can never disagree. Raising the hard ceiling itself is a plan change (it moves
cost), made in the rules, the schema and this file together.

## Studio: the upload component

One shared component in `packages/ui` (`FileDrop`, with the design skill's tokens and states),
used by the Image and File block editors and, later, the Media library.

Flow for an image:

1. The block editor shows two tabs, **Upload** (default for a new block) and **Link** (today's
   address field). An existing linked image opens on Link.
2. **Pick or drop** a file (button, drag and drop, or paste from the clipboard). The control states
   the policy before anyone picks: "WebP, PNG or JPEG · up to 500 KB · 1600 px wide is ideal".
3. **Check** in the browser: type by extension and first bytes, size, decoded pixel size
   (`createImageBitmap`). Fail → the guidance above, nothing uploaded. Under 800 px wide → a warning
   with the Small/Medium suggestion, upload still allowed.
4. **Preview** locally (an object URL) before upload, in the real player frame at the chosen
   layout, with a toggle between 1280 px and 390 px widths (`BlockPreviewFrame`).
5. **Layout** controls: Column / Medium / Small, Open full size on click, Border; plus Alt text
   (required, as today) and Caption.
6. **Upload** with a progress bar (`uploadBytesResumable`), cancellable. On success the block
   gets `url`, `upload`, `width`, `height`, and autosave stores the draft as for any edit. On
   failure: a clear retry message (offline, permission, too large per the server); nothing is
   written to the draft.
7. **Replace** uploads a new file and points the block at it. **Remove** clears the block. Neither
   deletes the old file (a published version may still use it).

The PDF flow is the same with no pixel check, no layout, and a Label field (today's Link text),
defaulting to the file name without extension.

**Bundle**: the Firebase Storage SDK loads only inside Studio's lazy chunk; learners never
download it (they load files by URL). The initial bundle budget is unchanged.

**Keyboard and screen readers**: the drop zone is a real button; progress is announced
(`aria-live`), errors are tied to the control (`aria-describedby`); the agent prompt's copy button
confirms with a toast.

## Player: layouts

`apps/web/src/player/blocks.tsx`, image case:

| Layout   | 1280 px                                     | 390 px                            | Use for                              |
| -------- | ------------------------------------------- | --------------------------------- | ------------------------------------ |
| `column` | full lesson column (780 px)                 | full width                        | screenshots, diagrams (default)      |
| `medium` | 2/3 of the column, centred                  | full width                        | photos, mid-size diagrams            |
| `small`  | at most 320 px, centred                     | at most 240 px, centred           | logos, icons, phone screenshots      |

- `<img>` gets `width`/`height` when known (no layout shift; Lighthouse CI already measures CLS),
  `loading="lazy"`, `decoding="async"`.
- **Open full size** (`zoom`): the image is a button that opens it in the existing `Dialog` at its
  natural size, scrollable, closes on Escape; the caption shows under it.
- **Border** draws the existing `--border` frame (today every figure has it; `border: false`
  removes it for photos and transparent PNGs).
- File block with `upload`: the link reads "Label · PDF · 420 KB" and opens in a new tab.
- An image that fails to load shows its alt text in a quiet box instead of the broken-image icon.

Layouts work for **linked** images too, so the player item can ship before uploads exist.

## Media library

`/studio/media` already lists every image, video, embed and file link in the courses a person can
see. It gains an **Uploaded** filter and size column, and (in `MED-08`) the lesson editor's Image
block gains **Choose from this course's media**, which reuses an uploaded file in another lesson
without uploading it again. Reuse across courses keeps working by copying the address.

## Clean-up of unused files

Files are immutable and small, so v1 deletes nothing automatically: deleting a file that a
published version or a rollback target still uses would break that version. `MED-10` adds a
weekly scheduled function that, per course, collects every `upload.path` in the draft, the live
course and every `versions/` snapshot, and deletes media files referenced by none of them and older
than 30 days. Until then the cost of orphans is negligible (see below).

## Cost

Cloud Storage for Firebase on Blaze. The no-cost tier applies to default buckets in `US-CENTRAL1`,
`US-EAST1` or `US-WEST1` (5 GB stored, 100 GB egress per month, 5,000 uploads and 50,000
downloads-by-rule per month, as of the October 2024 change for `*.firebasestorage.app` buckets).
**Verify the current numbers in the console before creating the bucket.** A bucket in
`asia-south1` (next to Firestore) has no free tier but costs about $0.02 per GB stored and
$0.12 per GB downloaded.

Estimate at 200 learners: 10 courses × 60 images × 250 KB ≈ 150 MB stored, plus PDFs ≈ 200 MB.
Downloads: a learner viewing every image of one course ≈ 15 MB, cached afterwards; 200 learners
× 3 courses ≈ 9 GB per month at most. Free in a US bucket; about $1/month in `asia-south1`, which
would trip the $1 budget alert. Hence the recommendation (open question 14): a **US-CENTRAL1**
bucket. The extra latency from India is a few hundred milliseconds on the first view of an image,
then the browser cache serves it for a year.

Firestore: one or two reads per upload (rules); none per view. Functions: none until `MED-10`
(one weekly run).

Guards: the per-file limits above; uploads only by Educators of the course; the budget alert; the
Admin can lower limits at any time. A per-course total cap is not in v1 (rules cannot count
files); revisit if storage passes 1 GB.

## Content rules

The Studio upload panel says, and the Educator guide repeats: no personal data (names, emails,
faces of people who have not agreed), no client names or internal NonStop process
(`.claude/rules/open-source.md`), no secrets visible in screenshots (tokens, keys, `.env`).
Crop or blur before uploading. Location metadata is stripped by the shrink prompt and by `MED-09`;
v1 does not re-encode uploads on the server.

## Testing

- `@gurukul/schema`: `uploadPolicy`, `checkUpload` (type, magic bytes, size, pixels), `shrinkPrompt`
  and the new block fields, 100% coverage.
- Storage rules: emulator tests, allowed and denied per condition, coverage of every expression.
- Studio: block editor tests with a fake Storage client (pick, refuse with guidance, copy prompt,
  preview, layout, upload progress, cancel, failure, replace).
- Player: each layout, zoom dialog, width/height attributes, load failure.
- e2e (`npm run e2e`): an Educator uploads a small PNG into a draft lesson in the emulator, publishes,
  and a learner sees it; a 600 KB file is refused with the prompt offered.
- Design: 1280 px and 390 px, keyboard only, contrast (`gurukul-design`).

## Delivery, one pull request each

| ID       | Slice                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------- |
| `MED-01` | Maintainer: create the bucket in the chosen location, grant the cross-service rules role          |
| `MED-02` | Schema: `uploadPolicy`, `checkUpload`, `shrinkPrompt`, block fields, `config/org.uploads` + rule  |
| `MED-03` | Player: image layouts, zoom, border, width/height, PDF size label (works for linked files too)   |
| `MED-04` | Storage: `storage.rules`, emulator, rules tests and coverage, `deploy.yml`, cost rule update      |
| `MED-05` | Studio: `FileDrop`, Image block Upload tab with check, guidance, prompt, preview, layout, upload  |
| `MED-06` | Studio: File block PDF upload                                                                     |
| `MED-07` | Admin: Uploads card in Org settings                                                               |
| `MED-08` | Studio: Media library Uploaded filter and "Choose from this course's media"                       |
| `MED-09` | Studio: Shrink it for me (in-browser WebP re-encode)                                              |
| `MED-10` | Functions: weekly clean-up of unreferenced media                                                  |

Each user-facing slice carries its changelog entry; `MED-05` adds the uploads section to the
Educator guide in `docs/` and a feature tip on the Upload tab (`adding-feature-tips`).
