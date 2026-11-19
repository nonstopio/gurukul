import {
  LONG_OPTION_RATIO,
  MAX_EXCLAMATIONS,
  MAX_PARAGRAPH_SENTENCES,
  MAX_SENTENCE_WORDS,
  WORN_PHRASES,
} from '@gurukul/schema/writingLint';
import type { AgentSkill, AgentStartRequest } from '../../../desktop/bridge';
import { TOOLS, toolList } from '../tools';
import type { Tool } from '../tools';
import humanize from './skills/humanize/SKILL.md?raw';
import lesson from './skills/lesson/SKILL.md?raw';
import outline from './skills/outline/SKILL.md?raw';
import quiz from './skills/quiz/SKILL.md?raw';
import system from './system.md?raw';

/*
 * What the Desktop Studio agent is told (`DSK-17`, `.plan/22-desktop-studio.md`, "Writing quality:
 * the humanizer"): the system prompt and the four skills, shipped with the web app so a better
 * prompt reaches every Educator with a normal deploy (decision 4). The markdown files are the text;
 * this module only assembles what `agent.start` hands the shell. Loaded only by the desktop session
 * chunk, never by an eager route.
 */

/** The plugin the shell writes the skills into; the agent sees each skill as `gurukul:{name}`. */
export const PLUGIN_NAME = 'gurukul';

/** The system prompt: written to the session's `prompt.md` (`--append-system-prompt-file`). */
export const SYSTEM_PROMPT: string = system;

/**
 * `lint-rules.md` of the humanize skill: the writing lint's limits and worn phrases, made from
 * `@gurukul/schema/writingLint` itself so the skill and the lint never disagree.
 */
export function lintRules(): string {
  const cell = (text: string) => text.replaceAll('|', '\\|');
  const phrases = WORN_PHRASES.map((w) => `| ${cell(w.phrase)} | ${cell(w.instead)} |`);
  return [
    '# What the writing lint checks',
    '',
    '`lint_writing` applies these rules to every text. Write so that it finds nothing. Code, link',
    'targets and addresses are never checked, and neither is spelling.',
    '',
    '## Every text',
    '',
    `- A sentence has at most ${MAX_SENTENCE_WORDS} words.`,
    `- A paragraph has at most ${MAX_PARAGRAPH_SENTENCES} sentences.`,
    `- A lesson has at most ${MAX_EXCLAMATIONS} exclamation mark, counted over its title and every block.`,
    '- A heading is in sentence case: a capital for the first word and for names only.',
    '- None of the worn phrases below, in any form.',
    '',
    '## Quiz questions and checks',
    '',
    '- No "all of the above" or "none of the above".',
    `- No answer more than ${LONG_OPTION_RATIO} times the median length: the long one is usually the right one.`,
    '- The explanation is never empty and never says only that an answer is right.',
    '- The explanation never names an answer by letter, number or position: answers are shuffled.',
    '- A negative question marks the negative: **not**, or NOT.',
    '',
    '## Worn phrases',
    '',
    '| Phrase | Instead |',
    '| --- | --- |',
    ...phrases,
    '',
  ].join('\n');
}

/** The four skills, in the order the work uses them. */
export const SKILLS: readonly AgentSkill[] = [
  { name: 'outline', files: [{ path: 'SKILL.md', text: outline }] },
  { name: 'lesson', files: [{ path: 'SKILL.md', text: lesson }] },
  { name: 'quiz', files: [{ path: 'SKILL.md', text: quiz }] },
  {
    name: 'humanize',
    files: [
      { path: 'SKILL.md', text: humanize },
      { path: 'lint-rules.md', text: lintRules() },
    ],
  },
];

/** What `agent.start` takes from the web app besides the session: prompt, skills and tools. */
export type AgentSetup = Pick<AgentStartRequest, 'systemPrompt' | 'skills' | 'tools'>;

/**
 * Everything the agent is told when a session starts or resumes: the system prompt, each skill's
 * files by path inside the skill's folder (the shell writes the plugin around them), and the tool
 * list. Fresh objects each call, so the caller may hand them on without sharing these constants.
 */
export function agentSetup(tools: readonly Tool[] = TOOLS): AgentSetup {
  return {
    systemPrompt: SYSTEM_PROMPT,
    skills: SKILLS.map((s) => ({ name: s.name, files: s.files.map((f) => ({ ...f })) })),
    tools: toolList(tools),
  };
}
