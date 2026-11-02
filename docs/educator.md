# Educator guide

Studio is where courses are built. You can create courses and edit the ones you are granted.
Other people's courses show as view-only.

## The shape of a course

A course is made of **chapters**. A chapter holds **lessons** and **Quizzes**. Every
lesson is a list of **blocks**: text, video, code, callout, image, embed, file or an ungraded check.
Ids never change once a lesson exists: learners' progress is matched by id, so renaming or moving a
lesson never loses anyone's work.

## Working in the Studio

- **New course**: a title, a level and a cover colour; the address (slug) is made from the title and
  can be edited until the first publish. You can also duplicate one of your courses.
- **Structure**: add and rename chapters, add lessons and Quizzes, and reorder with the grip button
  (press Space to lift, the arrow keys to move, Space to drop, Esc to cancel; `Alt`+arrow also
  moves one place).
- **Lesson editor**: edit the title, add blocks from the palette, reorder, duplicate or delete them,
  and choose the layout (Stacked, Split or Article), the estimated time and the completion rule.
- **Quiz builder**: write questions with 2–6 answers and mark the correct ones, add an
  explanation, link the lesson to revisit, and set the pass mark, number shown, retake wait, shuffle
  and when answers are revealed. Good questions can be saved to the **question bank** and imported
  into any Quiz.
- Your work **autosaves** a second after you stop typing ("Saved just now"). If someone else saved
  the same draft meanwhile you will be told, and asked to reload.

## Uploading images

An Image block has two tabs. **Upload** puts the picture in Gurukul, so there is nothing else to host and
the link cannot break. **Link** is the address of an image that lives elsewhere, as before. A new block
opens on Upload; an image you linked earlier opens on Link.

To upload, choose the file, drop it on the box, or focus the box and paste a copied image. Gurukul checks it
in your browser first and shows a preview at the size learners will see (1280 px or 390 px wide) before
anything is sent. Pick **Upload image** when it looks right. You can cancel a running upload, and if it
fails nothing is saved: try again. **Replace image** uploads a new file; **Remove image** clears the block.
Neither deletes the old file, because a published version may still show it.

**Shrink it for me.** If an image is refused only because it is too big in size or too wide in pixels
(a phone photo, a full-screen screenshot), the message offers **Shrink it for me**. It redraws the picture
in your browser as a WebP at most 1600 px wide, as sharp as the lesson needs, and shows it in the preview with
the saving, for example "1.8 MB to 180 KB". Nothing is sent until you pick **Upload image**; **Discard and
choose another** drops it. Transparency stays, and location and camera details are removed. It is never offered
for PDFs, SVGs or files that are not really WebP, PNG or JPEG. If the browser cannot do it, the message says
so and the prompt for your coding agent is still there.

### The numbers, and why

| What                 | Limit                                                          |
| -------------------- | -------------------------------------------------------------- |
| Types                | WebP, PNG or JPEG (not GIF, SVG, AVIF, HEIC, TIFF or BMP)      |
| Size                 | up to 500 KB (an Admin can set it anywhere from 50 KB to 1 MB) |
| Long side            | at most 2000 px; **1600 px wide is ideal**                     |
| Narrower than 800 px | allowed, with a warning: use the Small or Medium layout        |

A lesson column is about 780 px wide, so 1600 px is sharp even on a high-density screen, and anything
bigger only makes the page slower. The size limit keeps the pages quick on a phone and keeps the whole
platform inside its free storage. GIF and SVG are left out because an animation is several megabytes and an
SVG can carry script; a screen recording belongs on YouTube or Loom as a Video block.

### Shrink an image by hand

When a file is refused, the message shows its size and pixels and what to change. You have three ways
to fix it, and the same numbers apply to each:

1. **Ask a coding agent.** **Copy a prompt for your coding agent** puts a ready-made prompt, with your file's
   name and the live limits, on the clipboard. Paste it into Claude Code, Cursor, Copilot or any agent that
   can run commands on your machine.
2. **A browser tool such as Squoosh** (squoosh.app). It runs in your browser and does not upload the file.
   Open the image, choose **WebP**, set the quality to about 80, resize so the width is 1600, and save.
3. **macOS Preview.** Open the image, **Tools → Adjust Size…**, set the width to 1600 pixels (keep
   **Scale proportionally**), then **File → Export…** and choose JPEG or PNG, and move the quality slider
   until the size is under the limit.

Check the result is under the size limit, then pick it again. Photos carry their location and camera details:
Squoosh and the agent prompt remove them, so use one of those for a photo.

### What never goes into an upload

An uploaded file can be opened by anyone who is given its address, and it stays in storage. So:

- No personal data: names, email addresses, or the faces of people who have not agreed to be shown.
- No client names and no internal NonStop process.
- No secrets: tokens, keys, passwords, `.env` files or a terminal showing them.

**Crop or blur first**, then upload. A screenshot of a whole screen usually shows more than you meant to.

## Uploading PDFs

A File block has the same two tabs. **Upload** puts a PDF in Gurukul; **Link** is the address of a file that
lives elsewhere. A new block opens on Upload; a file you linked earlier opens on Link, and an uploaded one
on Upload. Choose the PDF, drop it on the box, or focus the box and paste. Gurukul checks it in your
browser first (it must really be a PDF, not a renamed file), then **Upload PDF** sends it. You can cancel
a running upload, and if it fails nothing is saved: try again. **Replace PDF** uploads a new file and
**Remove PDF** clears the block; neither deletes the old file, because a published version may still link it.
Typing an address on **Link** over an uploaded file turns the block into a plain link.

The **Label** is the words on the link. A new upload starts with the file name without `.pdf`; change it
to anything. Learners see it as "Label · PDF · 420 KB", and the preview under the block shows exactly that.

| What | Limit                                                        |
| ---- | ------------------------------------------------------------ |
| Type | PDF only                                                     |
| Size | up to 1 MB (an Admin can set it anywhere from 50 KB to 1 MB) |

A text PDF (a cheat sheet, a handout, slides exported with compressed pictures) is well under 1 MB. A
bigger one is usually a scan or full of large pictures. **Put larger files on GitHub or Google Drive**
(shared with nonstopio.com) and paste the address on the **Link** tab. When a PDF is refused for its
size, **Switch to Link** takes you there.

### Shrink a PDF by hand

1. **Ask a coding agent.** **Copy a prompt for your coding agent** puts a ready-made prompt, with your file's
   name and the live limit, on the clipboard. It asks for text that stays selectable and no document
   properties, and for a recommendation to link instead if the file will not fit.
2. **Re-export it smaller.** In the program that made it (Word, Keynote, Google Slides, Pages), export again
   with the image quality set to "reduced" or "web", or resize the pictures to about 150 dpi first.
3. **macOS Preview.** **File → Export…**, **Quartz Filter → Reduce File Size**. Check the text can still be
   selected afterwards, then check the size is under the limit and pick the file again.
4. **Ghostscript**, if you have it: `gs -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook -dNOPAUSE -dBATCH -sOutputFile=small.pdf big.pdf`.

The same content rules apply as for images: see [What never goes into an upload](#what-never-goes-into-an-upload).
Check document properties (author, comments) and hidden text, not only the pages you can see.

## Publishing

**Publish** checks the whole course and lists anything to fix: an empty lesson, a video link that is
not YouTube, Drive or Loom, an image with no alt text, a question with no marked answer. Fix them and
publish again. Publishing creates a new version learners see straight away. Learners already part-way
through keep their progress. Every version is kept: open **Versions** and **Roll back** to publish an
earlier one as a new version.

**Preview as learner** shows the draft the way learners will see it, without recording progress.
