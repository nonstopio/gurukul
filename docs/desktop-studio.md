# Gurukul Studio: build a course by chatting

Gurukul Studio is a desktop app for Educators. In it you build a new course, or change one you
already edit, by talking to an AI agent: you say what you want, the agent writes lessons and
Quizzes, and you watch the course change in a preview beside the chat. Nothing reaches the course
until you review everything the session did and save it to the draft in one step. Publishing stays
what it is in Studio today: you press **Publish** when you are ready.

The agent is Claude Code, Anthropic's program, running on your own computer and signed in with
your own Claude plan. Gurukul Studio starts it and talks to it; it never asks for, sees or keeps
your Claude sign-in. Everything else in Studio works in the browser exactly as before: you need the
app only for sessions.

## Before you start

You need:

- A Mac (Apple Silicon or Intel) or a Windows PC. There is no Linux installer.
- Your NonStop Google account, with the Educator role in Gurukul.
- A Claude plan of your own that includes Claude Code. Gurukul does not pay for it and never asks
  for it.

### 1. Install Gurukul Studio

In Studio in the browser, the course list shows a card, **Build a course by chatting**. It offers
the installer for your computer first, with its steps, and links to every release. You can also
download it from [the releases page](https://github.com/nonstopio/gurukul/releases/latest).

**On a Mac** (the same steps for Apple Silicon and Intel; pick the matching file, `arm64` for Apple
Silicon, `x64` for Intel):

1. Open the downloaded `.dmg` file.
2. Drag **Gurukul Studio** into the **Applications** folder.
3. Open Gurukul Studio from Applications.

The Mac app is signed and checked by Apple, so it opens without a warning.

**On Windows:**

1. Run the downloaded `Gurukul-Studio-Setup-….exe`. It installs for you alone; no administrator is
   needed.
2. The Windows installer is not signed yet, so **Windows SmartScreen** may say "Windows protected
   your PC". Choose **More info**, then **Run anyway**. This step goes away once the installer is
   signed.
3. Gurukul Studio opens when it is installed.

The app updates itself. When a new version has downloaded, **Update ready** appears in the sidebar;
choose it to restart into the new version. If a page says **Update the app**, the site needs a
newer app than yours: choose it, or **Check for updates…** in the app menu (on Windows, under
**Help**).

### 2. Install Claude Code and sign in to it

Claude Code is installed and signed in once, in a terminal, outside Gurukul Studio. Follow
[Anthropic's setup page](https://code.claude.com/docs/en/setup) for the current steps. In short:

- **Mac:** open **Terminal** and run `curl -fsSL https://claude.ai/install.sh | bash`.
- **Windows:** open **PowerShell** and run `irm https://claude.ai/install.ps1 | iex`.

Then, in the same terminal:

1. Run `claude`.
2. Type `/login` and press Enter. Your browser opens on Anthropic's own sign-in page; sign in with
   the Claude account that has your plan.
3. Once it says you are signed in, type `/exit`. You do not need to keep the terminal open.

Gurukul Studio needs Claude Code 2.1.328 or later. Run `claude update` in a terminal to update it.

You sign in to Claude Code only there, with Anthropic. Gurukul Studio never shows a Claude sign-in
of its own and never asks you to paste a key or a token: if anything ever does, do not.

### 3. Sign in to Gurukul

Open Gurukul Studio. It opens Studio's course list, and asks you to sign in as the website does:
accept the privacy policy, then choose **Sign in with Google**. Your browser opens Google's page,
where you pick your NonStop account. When the browser tab says so, go back to the app; you are
signed in. If you closed the tab by mistake, press **Sign in with Google** again.

## A first session, end to end

### Start

On the Studio course list, choose **New course with AI**, or **Edit with AI** on a course you
edit. There is no dialog: the session opens at once. Write what you want in the message box, for
example "The rebase chapter is too heavy. Simplify it and add a Quiz."

A course has one open session per person. If you already have one on that course, **Edit with AI**
opens it. **New course with AI** opens the new course you started and have not worked in yet, if
there is one, so empty sessions do not pile up.

### Chat

The session opens with the chat on the left and the course on the right. Your goal is already in
the message box: press **Send** (or Enter) to start, or reword it first. Shift and Enter start a
new line.

While the agent works, a line says what it is doing in plain words ("Rewriting lesson 3.2").
**Stop** ends its turn; whatever it had changed stays. Each finished turn shows a line such as
"Turn 4 · 4 changes", which opens Review on that turn. **Undo** on the newest turn puts the course
back as it was before that turn; undo older turns one at a time, newest first.

The right side has three tabs:

- **Preview** draws the course as a learner will see it, from the copy on your computer. Each
  added, changed or moved block carries a label saying so.
- **Outline** lists the chapters, lessons and Quizzes with what changed.
- **Sources** shows the session's Sources folder.

You can close the app at any time. The session and its chat are kept on your computer and open
where you left them: from the Studio course list, or with ⌘K (Ctrl-K on Windows) and the
session's name.

### Point at a part of the course

To talk about one block, question or lesson, press **Attach** beside it in the preview, or on its
row in the outline. It appears above the message box under "Attached to your next message", and
goes with your next message so the agent knows exactly which part you mean. Remove one from there
before you send.

### Edit by hand

Some changes are quicker to make yourself. **Open in editor** on a lesson or Quiz in the preview
or the outline opens Studio's own lesson editor or Quiz builder over the session's copy. Your edits
stay on your computer, not in the draft. When you leave the editor they become one turn of yours
in the chat, which Review lists and **Undo** takes back like any other, and the agent is told about
them with your next message.

### Review

Press **Review** in the top bar. It shows everything the session changed against the draft it
started from, on one screen, the way a pull request is reviewed:

- **Summary** and **Goals**: what the session did, written by the agent and yours to edit, and the
  goals ticked as done or not.
- **Changes**: every lesson, Quiz, chapter and course field that was added, changed, removed or
  moved, with a filter per turn. Select a row to see the words before and after.
- On a row: **Viewed** to tick it off, **Ask for a change** to attach it to your next message,
  **Open in editor**, and **Undo this item** to put that one thing back as the draft has it.
- **Checks**: whether the course is valid and within the size limit (both stop Save until fixed),
  whether the draft moved since the session started, writing notes, what is left for you, and
  what publishing will ask for.

There is no accept button per change. You read the list, ask for fixes in the chat, and decide
once, with Save.

### The second opinion on answers

For each Quiz question the session added or changed, Review asks a separate Claude Code run to
answer it, given only the question and the lessons around it, never the answer key. When its
answer differs from the key, the **Answers** line and the question's row say so ("A second opinion
chose B; the key says C"), so you can look again before learners do. It only informs: it never
changes a question or stops Save. Each check uses a little of your Claude plan, once per version of
a question. **Skip answer check** stops it for the session; **Check this answer** on a Quiz's row
asks for one question.

### Save to draft

When you are happy, press **Save N changes to draft** at the foot of Review. The confirmation names
the draft it replaces; confirm, and the whole session is written to the course's draft in one
step. Learners see nothing yet.

For a new course the button is **Create course and save draft**: it asks for the title and the
address (the address cannot change later), creates the course, then saves the draft. If the course
is created but the draft is not saved, the button offers the save again; the course is never
created twice.

If someone else saved the draft after your session started (or you did, in the browser), Review
says who and when, and offers **Bring in their changes**: anything only one of you changed is taken
as it is, and for anything both of you changed you choose whose version to keep. Then save.

Saving closes the session. It stays on your computer to read for 30 days. More work on the course
is a new session, which starts from the draft you just saved.

### Publish

The saved session shows **Open the course editor** and **Publish…**. **Publish…** opens Studio's
usual publish dialog, with its checks and the difference against the live version. Or publish
later from the course editor, as always.

## The Sources folder

A session can read material you give it: notes, an outline, a transcript, a README. Put the files
in the session's Sources folder and ask the agent to use them ("Build the lessons from the notes in
Sources").

- Every session has its own folder, made for you: `Documents/Gurukul Studio/<course
address>/sources` for a course, and a `new-course-…` folder under `Documents/Gurukul Studio` for
  a new one. The **Sources** tab shows where it is. You do not choose a folder.
- **Show in Finder** (or **Show in Explorer**) opens it. Files you add while the session is open are
  read from your next message on.
- The agent reads plain text only: text and Markdown, CSV, JSON, YAML, subtitles, other markup and
  source code, each at most 1 MB. It cannot read Word files, PDFs, slides or images: save them as
  text or Markdown first. It sees only the files directly in the folder (not in folders inside it),
  at most 1,000.
- The agent reads the folder and nothing else on your computer. It cannot change, add or delete
  files there.

Whatever the agent reads from Sources is sent to Anthropic under your Claude account, like the
rest of the session. Leave out client names, internal documents and anyone's personal data.

## Your Claude plan's limits

Every message you send, and each answer check, uses your own Claude plan. Gurukul pays nothing and
sees nothing of it. When your plan reaches its limit, the chat says so and the session waits; send
your message again once the limit resets, and the session carries on where it stopped. To use less:
ask for one lesson or one Quiz at a time, and press **Skip answer check** if you do not need the
second opinion.

## Where your session is kept

A session lives on your computer only, until you save it:

- **The session** (its copy of the course with the answer keys, the chat, and a copy after each
  turn for Undo) is in the app's own folder: `~/Library/Application Support/Gurukul Studio/sessions`
  on a Mac, `%APPDATA%\Gurukul Studio\sessions` on Windows. Do not edit these files.
- **Claude Code's own copy of the chat** is in Claude Code's folder (`~/.claude/projects` on a
  Mac, `%USERPROFILE%\.claude\projects` on Windows).
- **Your Sources folder** is wherever you chose; the app never changes it.

An open session is kept until you save it. 30 days after a session is saved, its files and Claude
Code's copy of its chat are removed; only its title, summary and counts are kept, as history. The
clean-up runs when you open the Studio course list in the app. Your Sources folder is never
removed.

What a session sends to Anthropic, and what Gurukul keeps, is on the [privacy
page](https://gurukul.nonstopio.com/privacy), under **Gurukul Studio sessions**.

## When something goes wrong

The chat shows a card in place of the message box when the agent cannot run, with what to do. Your
session is kept whatever happens: nothing up to the last finished turn is lost.

| The chat says                       | What to do                                                                                                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code is not on this computer | Install Claude Code (step 2 above), sign in to it in a terminal, then press **Check again**. If you installed it while the app was open and it is still not found, close Gurukul Studio and open it again.      |
| Claude Code needs an update         | Run `claude update` in a terminal, then **Check again**.                                                                                                                                                        |
| Sign in to Claude Code              | Open a terminal, run `claude`, type `/login` and sign in, then **Check again**.                                                                                                                                 |
| Your Claude plan's limit is reached | Wait until your plan's limit resets, then send your message again. Save to draft still works meanwhile.                                                                                                         |
| The agent stopped                   | Claude Code ended unexpectedly. Press **Start it again**; the session carries on from the last finished turn.                                                                                                   |
| Update the app                      | This version of Gurukul Studio is older than the site needs. Press **Update the app** (or **Check for updates…** in the app menu), then restart.                                                                |
| The app did not answer              | Try again. If it keeps happening, close Gurukul Studio and open it again; the session is kept.                                                                                                                  |
| The last turn is not saved          | Your computer could not write the last turn (a full disk, for example). Its changes are still on screen: the next turn writes them again, or **Undo** takes them back. Do not close the app until it is solved. |

Other things you may see:

- **The browser did not finish signing in:** the sign-in waits five minutes for the browser. Press
  **Sign in with Google** again in the app.
- **"Sessions open in the Gurukul Studio app"** in the browser: a session's page opens only in the
  app. Open the app and find the session on the Studio course list or with ⌘K.
- **The draft was saved by someone after this session started:** use **Bring in their changes** in
  Review before you save.
