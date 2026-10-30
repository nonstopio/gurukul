# Kulapati console

All screens use the sidebar shell with the Kulapati nav set and a content
max-width of 1200px. Header pattern: micro label, `<h1>` Fraunces 36px,
actions right (wrap under on narrow screens).

## 09 · Sanjaya overview — `/kulapati` [M4]

| Region | Spec |
|---|---|
| Filters | Date range select (30 days, quarter, all time), team select, secondary "Export CSV", primary "Assign courses" |
| KPI row | `grid repeat(auto-fit, minmax(min(220px,100%),1fr))`, gap 16. StatCard: label 13px `--text-muted`, value Fraunces 36px, sub-line 13px (delta in accent, or a progress bar, or a link). Overdue value uses `--danger` with the word "Overdue" in the label |
| Weekly chart | Card `flex 2 1 520px`: SVG bars, 12 weeks, light gridlines, y labels, last bar `--accent` with value label, others `--g-green-200`; `role="img"` + a `<table>` alternative in a visually hidden caption/details |
| Needs attention | Card `flex 1 1 320px`: up to 3 people (avatar, name, reason in danger/warning text, action button "Nudge"/"Reset"); pending-invites strip with "Resend" |
| Course funnel | Card with table: course, assigned, started, completed, completion bar + %, avg score, overdue chip; course name links to course analytics |

**Empty org:** KPIs show "—" with "No learners yet"; chart replaced by EmptyState.

## 10 · Learners — `/kulapati/learners` [M4]

| Region | Spec |
|---|---|
| Tabs | All / Signed in / Pending invite / Overdue, each with a count chip; underline `--accent` on current; `role="tablist"` |
| Filters | Search (debounced 250ms), team, course, role selects |
| Bulk bar | Appears when ≥1 row selected: `--chrome` bar, "{n} selected", chrome-dark buttons Assign course / Send reminder / Change role, "Clear" |
| Table | `DataTable`: checkbox column, learner (avatar + name + email), team, role chips, courses ("3 · 1 done"), overall progress (120px bar + %), last active, status chip. Selected rows `--accent-soft`-tinted. Pending invites: dashed avatar with mail icon, email as name, "Invited {date} by {name}" |
| Footer | "Showing 1–25 of 148", Previous / Next |

**Row click** opens the learner drawer (right, 480px, focus-trapped, Esc closes).

**Select all** selects the current page; a link "Select all 148" appears
above the table for cross-page selection.

## 11 · Assign courses — `/kulapati/assign` [M4]

Three numbered step cards + a sticky summary card (`flex 1 1 300px`, sticky
top 24px on wide screens).

| Step | Spec |
|---|---|
| 1 · Courses | Grid of checkbox cards (title, lessons · time); selected: 2px `--accent` border + pale ground |
| 2 · People | Segmented tabs: Search people / Paste emails / Upload CSV / Whole team. Paste: `PeoplePicker` — chips classified as signed in (accent-soft), new ("· new", dashed), already assigned (sunken, "· already assigned"), rejected (danger-soft, reason). Legend below. CSV: drop zone + file input, parse client-side, show the same chips. Team: select + member count |
| 3 · Deadline | Due date (`<input type=date>`), reminder select, toggles "Email learners now", "Mandatory" |
| Summary | Big count in Fraunces 40px "people will get {course}", `dl` of signed in / new / skipped / rejected / due, primary full-width "Assign to {n} people", note on how pending invites work |

**Submit:** button loading → success Toast "Assigned Git to 23 people (5
pending invites)" → navigate to Learners filtered to that course. Partial
failure: summary shows which emails failed with retry.

**Validation:** button disabled until ≥1 course and ≥1 assignable email;
rejected chips never block, they are skipped.

## 12 · Roles & access — `/kulapati/roles` [M4]

| Region | Spec |
|---|---|
| Role cards | 3 cards: chip (Shishya neutral, Acharya warning-soft, Kulapati chrome + gold text), count, English role in Fraunces 22px, description |
| Permission matrix | Table: capability × role; "Yes" in accent, "No" in subtle, "Granted courses" in body text |
| Acharyas | List: avatar, name/email, course chips, "Edit" → dialog |
| Note | Callout: roles are enforced by security rules |
| "Grant a role" | Dialog: person picker, role radio, course multi-select (Acharya), confirm. Self-demotion from Kulapati is disabled with an explanation |

## 13 · Course analytics — `/kulapati/courses/:courseId` [M4]

| Region | Spec |
|---|---|
| Header | Breadcrumb, `<h1>` course title, chips (Published · v3), Acharya + updated; secondary "Edit in Vyasa Studio", primary "Assign this course" |
| KPIs | Assigned, Started (% of assigned), Certified, Median time to finish |
| Where learners stop | `FunnelBar` rows: label (190px) · 26px bar on `--surface-sunken` · count right. The largest drop between consecutive rows is coloured warning and called out in a sentence below — computed, not hand-written |
| Hardest questions | Top 3 by first-try correct %; % coloured danger (<50%) or warning (<70%); "Edit question" → Pariksha builder at that question |
| Pariksha table | Pariksha, questions, attempts, first-try pass, average score, average retakes |

Acharyas reach the same screen from Studio for their own courses.
