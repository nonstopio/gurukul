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
//  It recognises `firebase`, `npx firebase`, `npx firebase-tools`, `npm exec firebase` and a path
//  ending in /firebase, at the start of any command in a chain (`&&`, `;`, `|`, `$(...)`). A
//  command hidden inside a script file (`sh deploy.sh`) or an alias is not seen. `--version`,
//  `--help`, `help`, `login` and `logout` touch no project and are let through.
//
//  If the payload cannot be read, it ASKS rather than falling silent: the matcher routes every
//  Bash call here, so a silent failure would wave through exactly what this exists to catch.
// =================================================================================================

import { decideBefore, readPayload, run } from './lib.mjs';

const PRODUCTION = 'nonstop-gurukul';
const LOCAL_ONLY = new Set(['help', 'login', 'logout', 'login:ci', 'login:list', 'login:use']);
const WRAPPERS = new Set(['sudo', 'env', 'time', 'exec', 'command', 'nohup']);

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
  while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || WRAPPERS.has(words[i])))
    i++;
  if (words[i] === 'npx' || (words[i] === 'npm' && words[i + 1] === 'exec')) {
    i += words[i] === 'npx' ? 1 : 2;
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
