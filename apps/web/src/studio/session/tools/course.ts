import type { Working } from '../../types';
import { z } from 'zod';

import { patchCourse, setCertificate, setCoverTheme, setPassMark, setRule } from '../../courseEdit';
import { defineTool, done, refuse } from './types';

const NOTHING = 'Give at least one field to change.';

export const setCourseDetails = defineTool({
  name: 'set_course_details',
  description:
    'Changes the course details: title, summary, level, cover colour and glyph, the course pass mark, the learning rules and the certificate title. Give only the fields to change. The cover image is media: leave it to the Educator (add_todo).',
  input: z.strictObject({
    title: z.string().trim().min(1).max(160).optional(),
    summary: z.string().max(240).optional().describe('One line shown on the course tile.'),
    level: z.enum(['foundation', 'intermediate', 'advanced']).optional(),
    coverTheme: z.enum(['forest', 'sand', 'sky', 'stone']).optional(),
    coverGlyph: z.string().max(8).optional().describe('One or two characters on the cover.'),
    passMarkPercent: z.int().min(0).max(100).optional().describe('Course pass mark for Quizzes.'),
    sequential: z.boolean().optional().describe('Learners take items in order.'),
    certificate: z.boolean().optional().describe('Finishing the course gives a certificate.'),
    requireVideoWatch: z.boolean().optional().describe('Videos must be watched to complete.'),
    certificateTitle: z.string().max(160).optional(),
  }),
  run: (state, input) => {
    if (Object.keys(input).length === 0) return refuse(NOTHING);
    let w: Working = state.work;
    const { coverGlyph, passMarkPercent, coverTheme, certificateTitle } = input;
    if (input.title !== undefined) w = patchCourse(w, { title: input.title });
    if (input.summary !== undefined) w = patchCourse(w, { summary: input.summary });
    if (input.level !== undefined) w = patchCourse(w, { level: input.level });
    if (coverTheme !== undefined) w = setCoverTheme(w, coverTheme);
    if (coverGlyph !== undefined)
      w = patchCourse(w, { cover: { ...w.course.cover, glyph: coverGlyph } });
    if (passMarkPercent !== undefined) w = setPassMark(w, passMarkPercent);
    for (const rule of ['sequential', 'certificate', 'requireVideoWatch'] as const) {
      const on = input[rule];
      if (on !== undefined) w = setRule(w, rule, on);
    }
    if (certificateTitle !== undefined) w = setCertificate(w, { title: certificateTitle });
    return done({ ...state, work: w }, `Updated ${Object.keys(input).join(', ')}.`);
  },
});

export const setLanding = defineTool({
  name: 'set_landing',
  description:
    'Changes the landing page: the description (markdown) and the learning outcomes. Outcomes are replaced as a whole list, in order; give the full list.',
  input: z.strictObject({
    description: z.string().max(10_000).optional(),
    outcomes: z
      .array(z.string().trim().min(1).max(200))
      .max(12)
      .optional()
      .describe('What a learner can do after the course, 2 to 12 short lines.'),
  }),
  run: (state, { description, outcomes }) => {
    if (description === undefined && outcomes === undefined) return refuse(NOTHING);
    const work = patchCourse(state.work, {
      ...(description !== undefined && { description }),
      ...(outcomes !== undefined && { outcomes }),
    });
    const said = [
      description !== undefined && 'description',
      outcomes && `${outcomes.length} outcomes`,
    ];
    return done(
      { ...state, work },
      `Updated the landing page: ${said.filter(Boolean).join(', ')}.`,
    );
  },
});

export const COURSE_TOOLS = [setCourseDetails, setLanding];
