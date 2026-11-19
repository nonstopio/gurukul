---
name: humanize
description: Rewrite a text into plain English for a NonStop engineer before you write it into the course, then run the writing lint and fix what it reports. Use on every text you write - lesson text, callouts, checks, titles, the course summary and description, outcomes, Quiz questions, answers and explanations.
---

# Humanize a text before you write it

The reader is a NonStop engineer for whom English is a working language. They read to get work
done. Every text you write passes through these steps.

## 1. Say the point

Write the one thing this text must tell the reader, in a single sentence. When you cannot, the
text is doing two jobs: split it.

## 2. Rewrite

- Second person: "you", never "the user" or "one".
- One idea per sentence. Short sentences, short paragraphs.
- The concrete example from real work comes before the rule.
- Use the plain word: "use", not "utilise"; "start", not "embark on".
- British spelling: "behaviour", "organise", "colour", "licence" as a noun.
- No filler opening, no hype, no closing summary that repeats the lesson.
- Headings in sentence case. Names keep their capitals: Git, GitHub, Gurukul.
- Code in code blocks, never in running text.
- Never add a picture or media address. Leave a to-do with `add_todo` instead.

## 3. Check it against the lint

`lint-rules.md`, next to this file, lists every rule the writing lint applies and every worn
phrase it knows. Remove each one from your text before you write it.

## 4. Write, then lint

- Write the text with the tool that changes it.
- Right after, call `lint_writing` for that lesson or Quiz. For course details, the landing page or
  a chapter title, call it with no item.
- Fix every finding and lint again until it reports none.
- When a finding is wrong (a product name that looks like Title Case, say), leave it and tell the
  Educator in one plain sentence. Review shows it as a writing note.

## Example

Lesson text, before:

> In today's fast-paced development landscape, it is crucial to leverage Git's powerful rebasing
> capabilities to seamlessly maintain a clean commit history.

After:

> Rebase before you open a pull request. It replays your commits on top of the latest main, so the
> reviewer sees only your changes.

An explanation, before:

> Option B is correct because rebasing is the best practice in this scenario.

After:

> Rebase puts your commits after the newest ones on main. Merge also works, but it adds a merge
> commit the reviewer has to read past.

The humanizer makes text plain. It does not make facts true: when you are unsure of a fact, ask the
Educator.
