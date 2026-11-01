# 13 · Open questions

Each has a recommendation. Answer inline or in the review.

| # | Question | Recommendation | Blocks |
|---|---|---|---|
| 1 | What is "AVB" from the brief? | Clarify; parked out of scope until then | — |
| 2 | Firestore location: `asia-south1` (Mumbai)? It cannot change later. | Yes, asia-south1 | M1 |
| 3 | Domain lock: rules-only, or also Identity Platform blocking function? | **Resolved as built:** rules-only. `signedIn()` in `firebase/firestore.rules` requires a verified `@nonstopio.com` Google account; there is no blocking function. Revisit if Gmail accounts become noise | M1 |
| 4 | Email for assignments and reminders: Gmail API via a NonStop mailbox, SMTP extension, or none in v1? | **Resolved:** Gmail API from a function, sender `gurukul@nonstopio.com`. Built as `KUL-24` | M4 |
| 5 | Who signs certificates (name, role)? | **Resolved:** the signatory is a setting in the Admin console, not code (`GIT-05`) | M3 |
| 6 | Public name and URL: `nonstop-gurukul.web.app`, or a custom domain like `academy.nonstopio.com`? | **Resolved:** custom domain `gurukul.nonstopio.com` (`OPS-18`, DNS in `OPS-24`) | M6 |
| 7 | Should Educators see learner names in course analytics? | **Resolved:** yes, for their own courses only (`KUL-25`) | M4 |
| 8 | Teams list: where does a learner's team come from? | **Resolved as recommended, built:** the list lives in `config/org.teams`, which the Teams page keeps; later superseded: learners no longer pick a team; Educators and Admins keep `teams/{id}.memberEmails` and the profile shows the teams a person is on, read only | M1 |
| 9 | Self-enrolment in unassigned courses? | Yes, all published courses are open to every NonStopian | M2 |
| 10 | Licence holder line: "NonStop io Technologies" correct legal name? | **Resolved:** "NonStop io Technologies Pvt. Ltd.", now in `LICENSE` | before going public |
| 11 | Staging project for previews instead of sharing production data? | Not for v1; add if previews cause trouble | — |
| 12 | Firestore backups need a Storage bucket (small cost). Do we want them? | **Resolved as recommended:** yes, weekly export with 4-week retention, well under $0.10/month. Built as `weeklyBackup`; see `docs/operations.md` | M6 |
| 13 | Release versioning: semantic-release tags and CHANGELOG like eklavya? | **Superseded:** no semantic versions and no CHANGELOG file. Each production deploy pushes a `release-YYYY.MM.DD-HHMM` tag and `/changelog` derives releases from those tags (`15-changelog-and-search.md`) | M2 |
| 14 | Course media bucket location: `US-CENTRAL1` (no-cost tier, a few hundred ms further from India on first view) or `asia-south1` (next to Firestore, about $1/month at 200 learners)? | **Resolved as recommended:** `US-CENTRAL1`. `US-CENTRAL1`: free, and images are cached for a year after the first view (`19-course-media-uploads.md` Cost) | `MED-01` |
| 15 | Who can open an uploaded file: anyone holding its download URL (like an unlisted video), or only signed-in people with access, checked on every view? | **Resolved as recommended:** download URLs. Download URLs: the URL lives inside the access-gated course object; checking every view costs Firestore reads and loses caching. Nothing personal is uploaded | `MED-04` |
| 16 | Upload limits: images 500 KB and 2000 px (1600 px recommended), PDFs 1 MB, Admin may lower either, hard ceiling 1 MB each? | **Resolved as recommended:** images 500 KB and 2000 px (1600 px recommended), PDFs 1 MB, hard ceiling 1 MB each, Admin may lower. Yes, as in `19-course-media-uploads.md` (The upload policy) | `MED-02` |
| 17 | Accepted types: WebP, PNG, JPEG and PDF only (no SVG, GIF, AVIF, HEIC, Office files)? | **Resolved as recommended:** WebP, PNG, JPEG and PDF only. Yes; SVG can carry script, GIFs are video in disguise, the rest are links | `MED-02` |
