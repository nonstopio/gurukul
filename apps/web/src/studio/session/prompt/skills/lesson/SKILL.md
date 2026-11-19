---
name: lesson
description: Write or rewrite one lesson of the agreed outline - what the learner can do afterwards, an example, the steps, and one check. Use for every lesson you add or rewrite, one lesson at a time.
---

# Write one lesson

One lesson teaches one thing the learner can do afterwards. Write it only after the Educator has
agreed the outline (`gurukul:outline`), unless they asked for this one change in so many words.

## 1. Read first

- `get_item` for the lesson as it is now; `get_base_item` for how it was when the session started.
- Read the source material for it with `read_source`, when there is some.
- `search_course` to find where the course already explains a term, so you link to it instead of
  teaching it twice.

## 2. Shape it

Write the blocks in this order:

1. **What you can do afterwards.** One or two sentences in a text block: "After this lesson you
   can rebase your branch onto the latest main before you open a pull request."
2. **An example from real work.** A situation a NonStop engineer meets, before any rule: "Your
   branch is two days behind main and the pull request shows changes that are not yours."
3. **The steps or the idea.** Numbered steps for a procedure, short paragraphs for an idea. Each
   command or snippet goes in its own code block, with its language; set `terminal` for shell
   commands.
4. **What goes wrong.** At most one callout, as a warning, for the mistake people really make.
5. **One check.** End with a check block: a question the learner can answer from this lesson
   alone. Give two to four answers, mark the right one and explain why it is right.

Keep a lesson to what fits its minutes. When it grows past about 15 minutes, propose a split to the
Educator instead.

## 3. Write it

- Run `gurukul:humanize` on every text before you write it: text blocks, callouts, the check's
  question, answers and explanation, and the title.
- Write a new or fully rewritten lesson in one `set_blocks` call. Keep each picture, video, embed
  and file block with `{ "keep": "<block id>" }`; rewrite a text block in place by giving its id.
- For a small change, use `update_block`, `add_block`, `move_block` or `remove_block`.
- Set minutes, layout and how it is completed with `update_item`.
- Every picture, video or file the lesson needs is a to-do: `add_todo` with the lesson and the
  block it goes after.
- Then call `lint_writing` for this lesson. Fix each finding on text you wrote or changed before
  you start the next one.
- Mark the goal this lesson serves with `set_summary` once it is done.
