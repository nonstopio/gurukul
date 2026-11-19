import {
  COURSE_BYTES_LIMIT,
  COURSE_BYTES_WARN,
  courseBytes,
  validateForPublish,
  workingSchema,
} from '@gurukul/schema';
import { z } from 'zod';
import { needItem } from './find';
import { describeIssue } from './issues';
import { answer, defineTool, refuse } from './types';

/** At most this many problems of one kind are listed; the count says how many there are. */
const LISTED = 30;

export const checkCourse = defineTool({
  name: 'check_course',
  description:
    'Checks the whole course as Review will: is it valid, how big it is against the size limit, and what still stops it being published (a draft may be saved unfinished). Call it before you say you are done.',
  input: z.strictObject({}),
  run: (state) => {
    const { course, answers } = state.work;
    const parsed = workingSchema.safeParse(state.work);
    const problems = parsed.success
      ? []
      : parsed.error.issues.map((i) => describeIssue(state.work, i));
    const bytes = courseBytes(course, answers);
    const publish = validateForPublish(course, answers);
    return answer(state, {
      valid: problems.length === 0,
      problems: problems.slice(0, LISTED),
      size: {
        bytes,
        limit: COURSE_BYTES_LIMIT,
        overLimit: bytes > COURSE_BYTES_LIMIT,
        nearLimit: bytes >= COURSE_BYTES_WARN,
      },
      readyToPublish: publish.length === 0,
      publishIssueCount: publish.length,
      publishIssues: publish.slice(0, LISTED),
      todosLeft: state.todos.filter((t) => !t.done).length,
    });
  },
});

export const lintWriting = defineTool({
  name: 'lint_writing',
  description:
    'Runs the writing lint (worn phrases, long sentences and paragraphs, Title Case headings, weak Quiz options and explanations) over the whole course or one lesson or Quiz. Fix what it reports before you finish.',
  input: z.strictObject({
    itemId: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe('One lesson or Quiz. Left out: the whole course.'),
  }),
  run: (state, { itemId }, ctx) => {
    if (itemId !== undefined) {
      const found = needItem(state.work.course, itemId);
      if (typeof found === 'string') return refuse(found);
    }
    const findings = ctx.lintWriting(state.work, { itemId: itemId ?? null });
    return answer(state, { count: findings.length, findings: findings.slice(0, LISTED) });
  },
});

export const CHECK_TOOLS = [checkCourse, lintWriting];
