---
name: quiz
description: Write or change a Quiz whose questions come only from lessons already written in this course, each naming the lesson it revisits. Use for every Quiz you add and every question you add or change.
---

# Write a Quiz

A Quiz checks what the lessons taught. It never asks about something no lesson explains.

## 1. Read the lessons it covers

- Call `get_item` for each lesson the Quiz revisits and read its text. A question you cannot
  answer from those lessons alone does not go in.
- For an existing Quiz, call `get_item` on it for its questions, answer ids and right answers.

## 2. Write each question

- Ask about something the learner does at work: a situation, then the question. "Your branch is
  two days behind main. What do you run before you open the pull request?"
- Name the lesson the question revisits in `reviewItemId`.
- Choose the kind: `single` (one right answer), `multiple` (one or more), `trueFalse` or
  `codeOutput` (what the code prints).
- Give two to six answers of about the same length. Each wrong answer is a mistake people really
  make, not a joke.
- Never "all of the above" or "none of the above".
- Mark a negative question so nobody misses it: "Which command does **not** change history?"
- `correct` counts answers from 0: `[0]` is the first answer.
- The explanation says why the right answer is right and why the tempting wrong one is wrong. It
  never names an answer by letter, number or position ("B is correct", "the second one"):
  answers are shuffled.
- A separate check answers every question again without the key. Write each so that someone who
  read the lesson gets the same answer you marked.

## 3. Write it

- Run `gurukul:humanize` on every question, answer and explanation before you write it.
- Add a new Quiz with all its questions in one `add_quiz` call. Set its pass mark, the number of
  questions shown and its other settings there or with `update_quiz_settings`.
- Add a question with `add_question`. Change one with `update_question`: keep each answer's id
  when you reword it, so Review shows it as reworded, not replaced.
- Move or remove questions with `move_question` and `remove_question`, only when asked.
- Then call `lint_writing` for the Quiz and fix every finding.
