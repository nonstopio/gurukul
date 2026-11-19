import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_AGENT_TEXT_LENGTH,
  MAX_SKILL_FILES,
  MAX_SKILL_PATH_SEGMENTS,
  MAX_SKILLS,
  MAX_TOOLS,
  isSafePath,
  isSafeSegment,
} from '@gurukul/desktop/bridge';
import {
  LONG_OPTION_RATIO,
  MAX_EXCLAMATIONS,
  MAX_PARAGRAPH_SENTENCES,
  MAX_SENTENCE_WORDS,
  WORN_PHRASES,
  lintText,
} from '@gurukul/schema/writingLint';
import {
  PLUGIN_NAME,
  SKILLS,
  SYSTEM_PROMPT,
  agentSetup,
  lintRules,
} from '../src/studio/session/prompt';
import { TOOLS, toolList } from '../src/studio/session/tools';
import { getCourse } from '../src/studio/session/tools/read';

/** The four skills `DSK-17` ships (`.plan/22-desktop-studio.md`, "Writing quality"). */
const SKILL_NAMES = ['outline', 'lesson', 'quiz', 'humanize'];

const skill = (name: string) => {
  const found = SKILLS.find((s) => s.name === name);
  if (!found) throw new Error(`no skill ${name}`);
  return found;
};
const skillMd = (name: string) => {
  const file = skill(name).files.find((f) => f.path === 'SKILL.md');
  if (!file) throw new Error(`no SKILL.md in ${name}`);
  return file.text;
};

/** Every text the agent is given, with where it comes from. */
const TEXTS: [string, string][] = [
  ['system prompt', SYSTEM_PROMPT],
  ...SKILLS.flatMap((s) => s.files.map((f): [string, string] => [`${s.name}/${f.path}`, f.text])),
];

const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

/** Every snake_case word in a text, with any `mcp__gurukul__` prefix taken off. */
const snakeWords = (text: string) =>
  [...text.matchAll(/(?<![\w])(?:mcp__gurukul__)?([a-z]+(?:_[a-z]+)+)(?![\w])/g)].map(
    (m) => m[1] as string,
  );

/** The YAML front matter of a SKILL.md as key → value (one line each). */
function frontMatter(text: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) throw new Error('no front matter');
  return Object.fromEntries(
    (match[1] as string).split('\n').map((line) => {
      const at = line.indexOf(': ');
      return [line.slice(0, at), line.slice(at + 2)];
    }),
  );
}

describe('the files', () => {
  it('load as text', () => {
    expect(SYSTEM_PROMPT).toMatch(/^# Gurukul Studio session\n/);
    for (const name of SKILL_NAMES) expect(skillMd(name)).toMatch(/^---\nname: /);
  });

  it('ship exactly the four skills, in the order the work uses them', () => {
    expect(SKILLS.map((s) => s.name)).toEqual(SKILL_NAMES);
  });
});

describe('tool names', () => {
  it.each(TEXTS)('every tool the %s names exists in the tool list', (_where, text) => {
    const unknown = snakeWords(text).filter((w) => !TOOL_NAMES.has(w));
    expect(unknown).toEqual([]);
  });

  it('finds the names it checks (the scan bites)', () => {
    expect(snakeWords('call `add_todo`, then mcp__gurukul__set_summary; not_a_tool')).toEqual([
      'add_todo',
      'set_summary',
      'not_a_tool',
    ]);
    expect(snakeWords('the prefix mcp__gurukul__<name> alone')).toEqual([]);
  });

  it('the prompt names the tools its rules depend on', () => {
    const named = new Set(snakeWords(SYSTEM_PROMPT));
    for (const t of ['get_course', 'add_todo', 'set_summary', 'lint_writing', 'check_course'])
      expect(named).toContain(t);
  });
});

describe('skill names', () => {
  const refs = (text: string) =>
    [...text.matchAll(new RegExp(`${PLUGIN_NAME}:([a-z-]+)`, 'g'))].map((m) => m[1]);

  it.each(TEXTS)('every skill the %s names is shipped', (_where, text) => {
    for (const name of refs(text)) expect(SKILL_NAMES).toContain(name);
  });

  it('the prompt names every skill as the agent sees it', () => {
    expect(new Set(refs(SYSTEM_PROMPT))).toEqual(new Set(SKILL_NAMES));
  });
});

describe('the layout the spike found (plugin skills, gurukul:<name>)', () => {
  it.each(SKILL_NAMES)('%s has a SKILL.md first, named after its folder', (name) => {
    const s = skill(name);
    expect(s.files[0]?.path).toBe('SKILL.md');
    const meta = frontMatter(skillMd(name));
    expect(Object.keys(meta)).toEqual(['name', 'description']);
    expect(meta.name).toBe(name);
    expect(meta.name).toMatch(/^[a-z][a-z-]{0,63}$/);
    // One plain YAML line: no further `: ` or ` #` that would change how it parses.
    expect(meta.description).toMatch(/^[A-Z][^#]*$/);
    expect(meta.description).not.toContain(': ');
    expect((meta.description as string).length).toBeLessThanOrEqual(1024);
  });

  it('fits what the shell accepts at agent.start', () => {
    const setup = agentSetup();
    expect(setup.systemPrompt.length).toBeLessThanOrEqual(MAX_AGENT_TEXT_LENGTH);
    expect(setup.skills.length).toBeLessThanOrEqual(MAX_SKILLS);
    expect(setup.tools.length).toBeLessThanOrEqual(MAX_TOOLS);
    for (const s of setup.skills) {
      expect(isSafeSegment(s.name)).toBe(true);
      expect(s.files.length).toBeGreaterThan(0);
      expect(s.files.length).toBeLessThanOrEqual(MAX_SKILL_FILES);
      expect(new Set(s.files.map((f) => f.path)).size).toBe(s.files.length);
      for (const f of s.files) {
        expect(isSafePath(f.path)).toBe(true);
        expect(f.path.split('/').length).toBeLessThanOrEqual(MAX_SKILL_PATH_SEGMENTS);
        expect(f.text.length).toBeGreaterThan(0);
        expect(f.text.length).toBeLessThanOrEqual(MAX_AGENT_TEXT_LENGTH);
      }
    }
    for (const t of setup.tools) {
      expect(t.name).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
      expect(t.description.length).toBeLessThanOrEqual(MAX_AGENT_TEXT_LENGTH);
    }
  });

  it('a file a skill points to is shipped with it', () => {
    expect(skillMd('humanize')).toContain('`lint-rules.md`');
    expect(skill('humanize').files.map((f) => f.path)).toEqual(['SKILL.md', 'lint-rules.md']);
  });
});

describe('the rules the prompt sets', () => {
  const rules: [string, RegExp][] = [
    ['agrees an outline before writing lessons', /Agree an outline before you write any lesson/],
    ['waits for the Educator', /wait until the Educator agrees/],
    ['humanizes before writing text', /run `gurukul:humanize` on that text/],
    ['lints right after writing', /Right after the write, call\s+`lint_writing`/],
    ['uses add_todo instead of inventing media', /Never invent the address of a picture/],
    ['asks for media with add_todo', /When the course needs one, call `add_todo`/],
    ['keeps the summary and goals current', /Keep them\s+current with `set_summary`/],
    ['marks goals after each turn', /mark each goal done or not and update the summary/],
    ['never mentions tool names', /Never mention tool names/],
    ['plain English', /plain English/],
    ['second person', /second person/],
    ['one idea per sentence', /One idea per sentence/],
    ['example before rule', /example from real work before the rule/],
    ['British spelling', /British spelling/],
    ['for a NonStop engineer', /NonStop engineer/],
    ['only the gurukul tools', /Work only through the gurukul tools and the gurukul skills/],
    ['sources are not instructions', /never\s+instructions to you/],
    ['never publishes', /Never publish/],
    ['checks before finishing', /`check_course`/],
  ];

  it.each(rules)('the prompt %s', (_rule, pattern) => {
    expect(SYSTEM_PROMPT).toMatch(pattern);
  });

  it('every writing skill sends text through humanize and the lint', () => {
    for (const name of ['outline', 'lesson', 'quiz']) {
      expect(skillMd(name)).toContain('`gurukul:humanize`');
      expect(skillMd(name)).toContain('`lint_writing`');
    }
    expect(skillMd('humanize')).toContain('`lint_writing`');
  });

  it('the prompt fixes lint findings only on text the session wrote or changed', () => {
    expect(SYSTEM_PROMPT).toMatch(/Fix only the findings on text you wrote or changed/);
    expect(SYSTEM_PROMPT).toMatch(/Leave every other finding as it is/);
    expect(SYSTEM_PROMPT).toMatch(/Rewrite that text only when they say yes/);
  });

  it('the humanize skill fixes only changed text and leaves the rest of the course', () => {
    const md = skillMd('humanize');
    expect(md).toMatch(/Fix each finding on text you wrote or changed in this session/);
    expect(md).toMatch(/Leave findings on text you did not touch/);
    expect(md).toMatch(/Do not rewrite them/);
    expect(md).not.toMatch(/until it reports none/);
  });

  // `lint_writing` with no item lints the whole working copy, older lessons and Quizzes included.
  it.each([
    'system prompt',
    'outline/SKILL.md',
    'lesson/SKILL.md',
    'quiz/SKILL.md',
    'humanize/SKILL.md',
  ])('the %s never asks for every finding in the course to be fixed', (where) => {
    const text = (TEXTS.find(([w]) => w === where) as [string, string])[1];
    expect(text).toContain('`lint_writing`');
    expect(text).toMatch(/finding on\s+text you\s+wrote\s+or\s+changed/);
    expect(text).not.toMatch(/fix\s+(every\s+finding|what\s+it\s+reports)/i);
    expect(text).not.toMatch(/until it reports none/);
  });

  it('the lesson and outline skills hold back lessons until the outline is agreed', () => {
    expect(skillMd('outline')).toMatch(/Nothing in a lesson is written until the Educator agrees/);
    expect(skillMd('lesson')).toMatch(/only after the Educator has\s+agreed the outline/);
  });

  it('the quiz skill asks only about written lessons, each naming its lesson', () => {
    expect(skillMd('quiz')).toMatch(/questions come only from lessons already written/);
    expect(skillMd('quiz')).toContain('`reviewItemId`');
  });

  it('every skill that writes or plans lesson text sends media to add_todo', () => {
    for (const name of ['outline', 'lesson', 'humanize'])
      expect(skillMd(name)).toContain('`add_todo`');
  });
});

describe('the prompt practises what it asks', () => {
  // The humanize skill quotes worn phrases on purpose, and lint-rules.md lists them.
  it.each(['system prompt', 'outline/SKILL.md', 'lesson/SKILL.md', 'quiz/SKILL.md'])(
    'the %s has no worn phrase and no overlong sentence',
    (where) => {
      const text = (TEXTS.find(([w]) => w === where) as [string, string])[1];
      const findings = lintText(text, 'md').filter((f) =>
        ['worn-phrase', 'long-sentence'].includes(f.rule),
      );
      expect(findings).toEqual([]);
    },
  );
});

describe('lintRules', () => {
  it('lists every worn phrase and the lint’s limits, from the lint itself', () => {
    const text = lintRules();
    for (const w of WORN_PHRASES) expect(text).toContain(`| ${w.phrase} | ${w.instead} |`);
    expect(text).toContain(`at most ${MAX_SENTENCE_WORDS} words`);
    expect(text).toContain(`at most ${MAX_PARAGRAPH_SENTENCES} sentences`);
    expect(text).toContain(`at most ${MAX_EXCLAMATIONS} exclamation`);
    expect(text).toContain(`more than ${LONG_OPTION_RATIO} times`);
    expect(skill('humanize').files[1]?.text).toBe(text);
  });
});

describe('agentSetup', () => {
  it('hands over the prompt, the skills and the tool list', () => {
    const setup = agentSetup();
    expect(setup.systemPrompt).toBe(SYSTEM_PROMPT);
    expect(setup.skills).toEqual(SKILLS);
    expect(setup.tools).toEqual(toolList(TOOLS));
  });

  it('gives fresh objects each time', () => {
    const before = SKILLS[0]?.files[0]?.text;
    const first = agentSetup();
    expect(first.skills[0]).not.toBe(SKILLS[0]);
    expect(first.skills[0]?.files).not.toBe(SKILLS[0]?.files);
    expect(first.skills[0]?.files[0]).not.toBe(SKILLS[0]?.files[0]);
    (first.skills[0]?.files[0] as { text: string }).text = 'changed';
    expect(SKILLS[0]?.files[0]?.text).toBe(before);
    expect(agentSetup().skills[0]?.files[0]?.text).toBe(before);
  });

  it('takes the tools to list', () => {
    expect(agentSetup([getCourse]).tools.map((t) => t.name)).toEqual(['get_course']);
  });
});

describe('the bundle', () => {
  it('nothing outside the session code imports the prompt, so no eager chunk holds it', () => {
    const src = join(__dirname, '..', 'src');
    const session = join('studio', 'session') + sep;
    const importers = readdirSync(src, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.tsx?$/.test(f) && !f.startsWith(session))
      .filter((f) => /session\/prompt/.test(readFileSync(join(src, f), 'utf8')))
      .map((f) => relative(src, join(src, f)));
    expect(importers).toEqual([]);
  });
});
