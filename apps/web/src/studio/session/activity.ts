/*
 * The chat's activity line while the agent works says what it is doing in plain words, never a tool
 * name (`.plan/22-desktop-studio.md`, The session workspace). One line per course tool; a test
 * checks every tool in `TOOLS` has one.
 */

export const TOOL_ACTIVITY: Readonly<Record<string, string>> = {
  get_course: 'Reading the course',
  get_item: 'Reading a lesson',
  get_base_item: 'Reading the draft as it was',
  search_course: 'Searching the course',
  list_changes: 'Looking over the changes so far',
  list_sources: 'Looking at the source files',
  read_source: 'Reading a source file',
  set_course_details: 'Changing the course details',
  set_landing: 'Changing the landing page',
  add_chapter: 'Adding a chapter',
  update_chapter: 'Renaming a chapter',
  move_chapter: 'Moving a chapter',
  remove_chapter: 'Removing a chapter',
  add_lesson: 'Adding a lesson',
  add_quiz: 'Adding a Quiz',
  update_item: 'Changing a lesson’s settings',
  move_item: 'Moving a lesson',
  remove_item: 'Removing a lesson',
  add_block: 'Writing a lesson',
  update_block: 'Rewriting a block',
  move_block: 'Moving a block',
  remove_block: 'Removing a block',
  set_blocks: 'Rewriting a lesson',
  update_quiz_settings: 'Changing the Quiz settings',
  add_question: 'Writing a question',
  update_question: 'Rewriting a question',
  move_question: 'Moving a question',
  remove_question: 'Removing a question',
  check_course: 'Checking the course',
  lint_writing: 'Checking the writing',
  set_summary: 'Writing the summary',
  add_todo: 'Noting something for you',
  resolve_todo: 'Ticking off a note',
};

/** The activity line for a course tool; a name it does not know gets a general line. */
export const toolActivity = (name: string): string =>
  TOOL_ACTIVITY[name] ?? 'Working on the course';
