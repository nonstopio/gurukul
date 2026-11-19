import { z } from 'zod';
import type { SessionTodo } from '@gurukul/schema';
import { idMaker, needItem } from './find';
import { defineTool, done, refuse } from './types';

const id = z.string().min(1).max(80);

export const setSummary = defineTool({
  name: 'set_summary',
  description:
    'Keeps the session’s own record current, as the Educator sees it in Review: its title, the goals (the full list, each marked done or not) and a summary of what the session did. Give only what changes. Never drop a goal the Educator set; mark it done or not.',
  input: z.strictObject({
    title: z.string().trim().min(1).max(160).optional(),
    goals: z
      .array(z.strictObject({ text: z.string().trim().min(1).max(300), done: z.boolean() }))
      .max(20)
      .optional(),
    summary: z
      .string()
      .max(4_000)
      .optional()
      .describe('What the session changed and why, in a few plain sentences.'),
  }),
  run: (state, { title, goals, summary }) => {
    if (title === undefined && goals === undefined && summary === undefined)
      return refuse('Give at least one of title, goals or summary.');
    const next = {
      ...state,
      ...(title !== undefined && { title }),
      ...(goals !== undefined && { goals }),
      ...(summary !== undefined && { summary }),
    };
    const met = next.goals.filter((g) => g.done).length;
    return done(next, `Saved the session record: ${met} of ${next.goals.length} goals done.`);
  },
});

export const addTodo = defineTool({
  name: 'add_todo',
  description:
    'Leaves a task for the Educator, shown in Review as "Left for you": every picture, video, embed or file the course needs (say what it shows and where it goes), and any fact you could not check. Point it at a lesson or Quiz, and a block, when it belongs to one.',
  input: z.strictObject({
    text: z.string().trim().min(1).max(300),
    itemId: id.optional().describe('The lesson or Quiz it belongs to.'),
    blockId: id.optional().describe('The block it goes after or replaces; needs itemId.'),
  }),
  run: (state, { text, itemId, blockId }, ctx) => {
    if (blockId !== undefined) {
      if (itemId === undefined)
        return refuse('Give the itemId of the lesson that holds the block.');
      const found = needItem(state.work.course, itemId);
      if (typeof found === 'string') return refuse(found);
      if (found.item.type !== 'lesson' || !found.item.blocks.some((b) => b.id === blockId))
        return refuse(`"${itemId}" has no block "${blockId}". Call get_item to see its blocks.`);
    } else if (itemId !== undefined) {
      const found = needItem(state.work.course, itemId);
      if (typeof found === 'string') return refuse(found);
    }
    const todo: SessionTodo = {
      id: idMaker(ctx, state.work, state)('todo'),
      text,
      ...(itemId !== undefined && { itemId }),
      ...(blockId !== undefined && { blockId }),
      done: false,
      createdAt: ctx.now().toISOString(),
    };
    return done({ ...state, todos: [...state.todos, todo] }, `Added to-do ${todo.id}.`);
  },
});

export const resolveTodo = defineTool({
  name: 'resolve_todo',
  description:
    'Marks a to-do done (or not done again), when the work it asked for is no longer needed or has been done.',
  input: z.strictObject({
    todoId: id,
    done: z.boolean().optional().describe('Left out: true.'),
  }),
  run: (state, { todoId, done: isDone = true }) => {
    if (!state.todos.some((t) => t.id === todoId))
      return refuse(`There is no to-do "${todoId}". Call get_course to see them.`);
    const todos = state.todos.map((t) => (t.id === todoId ? { ...t, done: isDone } : t));
    return done({ ...state, todos }, `Marked to-do ${todoId} ${isDone ? 'done' : 'not done'}.`);
  },
});

export const SESSION_TOOLS = [setSummary, addTodo, resolveTodo];
