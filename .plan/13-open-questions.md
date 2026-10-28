# 13 · Open questions

Each has a recommendation. Answer inline or in the review.

| # | Question | Recommendation | Blocks |
|---|---|---|---|
| 1 | What is "AVB" from the brief? | Clarify; parked out of scope until then | — |
| 2 | Firestore location: `asia-south1` (Mumbai)? It cannot change later. | Yes, asia-south1 | M1 |
| 3 | Domain lock: rules-only, or also Identity Platform blocking function? | **Resolved as built:** rules-only. `signedIn()` in `firebase/firestore.rules` requires a verified `@nonstopio.com` Google account; there is no blocking function. Revisit if Gmail accounts become noise | M1 |
| 4 | Email for assignments and reminders: Gmail API via a NonStop mailbox, SMTP extension, or none in v1? | Gmail API from a function, sender `academy@nonstopio.com` | M4 |
| 5 | Who signs certificates (name, role)? | The L&D owner, e.g. "[Name], Kulapati, NonStop Gurukul" | M3 |
| 6 | Public name and URL: `nonstop-gurukul.web.app`, or a custom domain like `academy.nonstopio.com`? | Custom domain (free on Hosting) | M6 |
| 7 | Should Acharyas see learner names in course analytics? | Yes, for their own courses only | M4 |
| 8 | Teams list: where does a learner's team come from? | **Resolved as recommended, built:** the list lives in `config/org.teams`, which a Kulapati edits in Org settings (`/kulapati/settings`); Home asks a learner with no team to pick one, and the rules accept only a listed team (or none) on `users/{uid}.team` | M1 |
| 9 | Self-enrolment in unassigned courses? | Yes, all published courses are open to every NonStopian | M2 |
| 10 | Licence holder line: "NonStop io Technologies" correct legal name? | Confirm exact legal entity for `LICENSE` | before going public |
| 11 | Staging project for previews instead of sharing production data? | Not for v1; add if previews cause trouble | — |
| 12 | Firestore backups need a Storage bucket (small cost). Do we want them? | **Resolved as recommended:** yes, weekly export with 4-week retention, well under $0.10/month. Built as `weeklyBackup`; see `docs/operations.md` | M6 |
| 13 | Release versioning: semantic-release tags and CHANGELOG like eklavya? | **Superseded:** no semantic versions and no CHANGELOG file. Each production deploy pushes a `release-YYYY.MM.DD-HHMM` tag and `/changelog` derives releases from those tags (`15-changelog-and-search.md`) | M2 |
