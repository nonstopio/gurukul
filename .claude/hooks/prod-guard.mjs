// =================================================================================================
//  Ask before the Firebase CLI runs against PRODUCTION (project nonstop-gurukul).
//
//  PreToolUse on Bash. Exits 0 always. It never denies: it turns a silent command into a prompt
//  that names the project and shows the command.
//
//  WHY THIS EXISTS
//
//  .firebaserc makes `nonstop-gurukul` the DEFAULT project, so any firebase command typed without
//  `--project` goes to production: `firestore:delete`, `auth:export` (every learner's email),
//  `functions:config:set`, `hosting:disable`. settings.json already denies `firebase deploy`,
//  because production deploys only happen from `main` through deploy.yml. This covers everything
//  else the CLI can do to the real project from a laptop.
//
//  The emulators are the normal way to work and are never asked about: any `emulators:*`
//  subcommand, and any command with `--project demo-*` (`npm run emulators` uses demo-gurukul,
//  a demo project the emulators keep entirely local).
//
//  ASK, NOT DENY, DELIBERATELY. Reading production is sometimes the right thing to do, and a guard
//  that refuses it would be routed around within a week. This only insists somebody looks first.
//
//  WHAT IT DOES NOT DO
//
//  It recognises `firebase`, `npx`/`bunx`/`pnpx`/`yarn`/`pnpm`/`pnpm dlx|exec`/`npm exec|x`
//  `firebase[-tools]` and a path ending in /firebase, behind `sudo`, `env`, `xargs`, `time` and the
//  like, at the start of any command in a chain (`&&`, `;`, `|`, `$(...)`). It looks inside
//  `sh|bash|zsh -c "…"`, `sh <<< "…"` and `eval …`, nested to any depth. A command hidden inside
//  a script file (`sh deploy.sh`), a pipe into a shell (`echo … | sh`), a `$(…)` that builds the
//  command, another interpreter (`python -c`) or an alias is not seen. `--version`,
//  `--help`, `help`, `login` and `logout` touch no project and are let through.
//
//  If the payload cannot be read, it ASKS rather than falling silent: the matcher routes every
//  Bash call here, so a silent failure would wave through exactly what this exists to catch.
// =================================================================================================

import { decideBefore, readPayload, run } from './lib.mjs';

const PRODUCTION = 'nonstop-gurukul';
const LOCAL_ONLY = new Set(['help', 'login', 'logout', 'login:ci', 'login:list', 'login:use']);
// Commands that run the next command, and their options that take a value as the next word.
// `command` takes none: `command -v firebase` only looks the binary up.
const WRAPPERS = {
  sudo: new Set(['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-T', '-U']),
  env: new Set(['-u', '-C', '-S']),
  xargs: new Set(['-I', '-n', '-P', '-L', '-s', '-d', '-E', '-a']),
  time: new Set(),
  exec: new Set(),
  nohup: new Set(),
  corepack: new Set(),
  command: null,
};
// A quoted argument that is a whole command line of its own: `sh -c "…"`, `sh <<< "…"`, `eval …`.
const QUOTED = String.raw`(?:"((?:[^"\\]|\\.)*)"|'([^']*)')`;
const SHELL = String.raw`\b(?:ba|z|da|k|a)?sh\b`;
const NESTED = [
  new RegExp(String.raw`${SHELL}(?:\s+-[-\w]+)*?\s+-[A-Za-z]*c\s+${QUOTED}`, 'g'),
  new RegExp(String.raw`${SHELL}[^<|;&]*<<<\s*${QUOTED}`, 'g'),
  /\beval\s+(.+)/g,
];

/** How many words the package-runner prefix at `i` takes (`pnpm dlx` is 2), or 0 if none. */
function launcherLength(words, i) {
  const [w, next] = [words[i], words[i + 1]];
  if (
    (w === 'npm' && (next === 'exec' || next === 'x')) ||
    ((w === 'pnpm' || w === 'yarn') && (next === 'dlx' || next === 'exec')) ||
    (w === 'bun' && next === 'x')
  )
    return 2;
  // `yarn firebase …` and `pnpm firebase …` run a package binary directly.
  return w === 'npx' || w === 'bunx' || w === 'pnpx' || w === 'yarn' || w === 'pnpm' ? 1 : 0;
}

/** Splits a shell command into simple commands, each a list of words with quotes removed. */
function simpleCommands(command) {
  return command
    .split(/&&|\|\||[;|\n&`(){}]|\$\(/)
    .map((segment) =>
      (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((w) => w.replace(/^(['"])(.*)\1$/, '$2')),
    )
    .filter((words) => words.length > 0);
}

/** If this simple command runs the Firebase CLI, returns its arguments; otherwise null. */
function firebaseArgs(words) {
  let i = 0;
  while (i < words.length) {
    const valueFlags = Object.hasOwn(WRAPPERS, words[i]) ? WRAPPERS[words[i]] : undefined;
    if (valueFlags === undefined && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) break;
    i++;
    while (valueFlags && i < words.length && words[i].startsWith('-'))
      i += valueFlags.has(words[i]) ? 2 : 1;
  }
  const launcher = launcherLength(words, i);
  if (launcher) {
    i += launcher;
    while (i < words.length && words[i].startsWith('-')) {
      // `-p pkg` / `--package pkg` take a value; `-y`, `--yes`, `--` do not.
      i += words[i] === '-p' || words[i] === '--package' ? 2 : 1;
    }
  }
  const bin = (words[i] ?? '').split('/').pop().replace(/@.*$/, '');
  if (bin !== 'firebase' && bin !== 'firebase-tools') return null;
  return words.slice(i + 1);
}

/** The production-facing call in `command`, or null if every firebase call is local. */
function productionCall(command) {
  // Look inside quoted command lines; the splitter below cuts at separators, quoted or not.
  for (const re of NESTED) {
    for (const m of command.matchAll(re)) {
      const inner = (m[1] ?? m[2]).replace(/\\(.)/g, '$1').replace(/^(['"])(.*)\1$/, '$2');
      const call = productionCall(inner);
      if (call) return call;
    }
  }
  for (const words of simpleCommands(command)) {
    const args = firebaseArgs(words);
    if (!args) continue;
    let project = null;
    let sub = null;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--project' || a === '-P') project = args[++i] ?? '';
      else if (a.startsWith('--project=')) project = a.slice('--project='.length);
      else if (!a.startsWith('-') && sub === null) sub = a;
    }
    if (sub === null && args.some((a) => /^(-V|--version|-h|--help)$/.test(a))) continue;
    if (sub !== null && (sub.startsWith('emulators:') || LOCAL_ONLY.has(sub))) continue;
    if (project !== null && project.startsWith('demo-')) continue;
    return { project };
  }
  return null;
}

function shorten(command) {
  const flat = command.replace(/\s+/g, ' ').trim();
  return flat.length > 300 ? `${flat.slice(0, 300)}…` : flat;
}

await run(async () => {
  const payload = await readPayload();
  if (!payload) {
    decideBefore(
      'ask',
      'PRODUCTION?\n\nCould not read the tool input, so this command is being confirmed rather ' +
        `than waved through. Check it does not run the Firebase CLI against ${PRODUCTION}.`,
    );
    return;
  }
  const command = payload.tool_input?.command;
  if (typeof command !== 'string' || !command) return;
  const call = productionCall(command);
  if (!call) return;

  const target =
    call.project === null
      ? `No --project was given, so .firebaserc sends this to the default project: ${PRODUCTION} (production).`
      : call.project === PRODUCTION || call.project === 'default'
        ? `--project names production: ${PRODUCTION}.`
        : `--project ${call.project} is not a demo-* emulator project. Production is ${PRODUCTION}.`;

  decideBefore(
    'ask',
    `PRODUCTION FIREBASE\n\n${target}\nFor local work use the emulators ` +
      '(`npm run emulators`, project demo-gurukul). Production changes ship from `main` ' +
      `through deploy.yml.\n\n${shorten(command)}`,
  );
});
