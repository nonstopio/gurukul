---
name: outline
description: Plan a course, a chapter or a restructure as chapters, lessons and Quizzes, and agree it with the Educator before any lesson is written. Use at the start of a new course, before adding a chapter or several lessons, and before moving or splitting lessons.
---

# Agree the outline first

Nothing in a lesson is written until the Educator agrees the outline. An outline is cheap to
change; twelve written lessons are not.

## 1. Read what is there

- Call `get_course` for the course as it is: chapters, lessons, Quizzes and the goals.
- When there is a Sources folder, call `list_sources` and read what matters with `read_source`.
- For an edit, read the lessons you would change with `get_item`.

## 2. Draft the outline

- Start from the learner: a NonStop engineer. Say in one line what they can do after the course.
- Write two to six outcomes, each something the learner can do: "Rebase a branch onto the latest
  main".
- Group lessons into chapters of three to six lessons. Each chapter is one stage of the work.
- Each lesson teaches one thing the learner can do afterwards. Name it after that thing, in
  sentence case: "Rebase before you open a pull request", not "Rebasing Overview".
- Give each lesson its minutes, usually 5 to 15.
- Put a Quiz at the end of a chapter when the chapter teaches something worth checking. Say which
  lessons it revisits.
- Name the pictures, videos and files the course will need. You never make them; they become
  to-dos for the Educator.

## 3. Ask the Educator

Show the outline in the chat as a numbered list: chapters, then their lessons and Quizzes, each
with one line on what the learner can do afterwards. Then ask whether to go ahead.

- Do not call any tool that adds or writes a lesson while you wait.
- When the Educator changes the outline, show the new one and ask again.
- For an edit, show only the part that changes and say what stays.

## 4. Build the frame once they agree

- Run `gurukul:humanize` on the titles and outcomes first.
- Add chapters with `add_chapter` and empty lessons with `add_lesson`, in order. Rename or move
  what already exists with `update_chapter`, `update_item`, `move_chapter` and `move_item`.
- Set the outcomes with `set_landing`, then call `lint_writing` with no item. Fix each finding on
  text you wrote or changed: the titles and outcomes. Leave the rest of the course as it is.
- Record the agreed plan with `set_summary`: the title and one goal per agreed piece of work.
- Add a to-do with `add_todo` for every picture, video or file the outline needs.

Then write the lessons one by one with `gurukul:lesson`.
