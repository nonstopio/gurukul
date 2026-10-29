---
paths:
  - 'packages/schema/**'
  - 'apps/web/src/**'
  - 'firebase/functions/src/**'
---

# One course, one document

A course is a single Firestore document, `courses/{courseId}`, holding its
chapters, items and content blocks. The learner player is one generic renderer
that walks any course object. See `.plan/02-data-model.md`.

- The shape is defined once, in `packages/schema` (zod), and imported by the web
  app and functions. Never hand-type a course shape somewhere else.
- Changing the shape means bumping `schemaVersion`, writing a pure migration
  `vN → vN+1` with tests, and updating `.plan/02-data-model.md` in the same PR.
- Item and block ids are stable forever. Progress refers to them, so renaming a
  lesson keeps its id; deleting one leaves progress pointing at nothing, which
  the progress calculator must tolerate.
- A new block type needs: the schema entry, a renderer in the player, an editor
  in Studio, and tests for all three. A block the player does not know
  renders a visible "unsupported block" notice, never a crash.
- Keep a course document well under Firestore's 1 MiB limit. Video lives on
  YouTube (or another host); images go to Hosting or a URL, never inline base64.
- Answer keys never live in the course document.
