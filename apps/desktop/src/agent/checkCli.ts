import { createInterface } from 'node:readline';
import type { AgentPlatform } from './platform';
import { runSignedInCheck, type CheckTimeouts } from './signedInCheck';

/**
 * `npm run check:claude -w @gurukul/desktop`: the signed-in check's command line (`DSK-26`). Reads
 * the arguments, says what the check will spend, asks before going on unless `--yes`, runs
 * `runSignedInCheck` and gives the exit code. `scripts/check-claude.ts` hands it the real process.
 */

export interface CheckArgs {
  yes: boolean;
  help: boolean;
  claudePath: string | null;
}

export const USAGE = `Usage: npm run check:claude -w @gurukul/desktop -- [--yes] [--claude <path>]

  --yes            do not ask before using the plan
  --claude <path>  check this program instead of the first claude on PATH
                   (Windows: point it at the other install, claude.exe or claude.cmd)
  --help           this text
`;

export const INTRO = `Gurukul Studio signed-in check (DSK-26)

This starts your own claude with the flags and environment Gurukul Studio uses, in a temporary
folder, and sends three short scripted messages. It uses a few messages of your Claude plan.
It prints no credential, token or account name. Claude Code's copy of the chat is removed at the end.

`;

export function parseCheckArgs(argv: readonly string[]): CheckArgs | { error: string } {
  const args: CheckArgs = { yes: false, help: false, claudePath: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--yes' || arg === '-y') args.yes = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--claude') {
      const value = argv[i + 1];
      if (value === undefined || value === '') return { error: '--claude needs a path' };
      args.claudePath = value;
      i += 1;
    } else return { error: `Unknown option: ${String(arg)}` };
  }
  return args;
}

/** Asks `Continue? [y/N]` on the terminal; anything but yes, or no answer at all, is no. */
export function askToContinue(
  input: NodeJS.ReadableStream,
  write: (text: string) => void,
): Promise<boolean> {
  write('Continue? [y/N] ');
  return new Promise((resolve) => {
    const lines = createInterface({ input, terminal: false });
    lines.once('line', (line) => {
      resolve(/^\s*y(es)?\s*$/i.test(line));
      lines.close();
    });
    lines.once('close', () => resolve(false));
  });
}

export interface CheckMainOptions {
  argv: readonly string[];
  platform: AgentPlatform;
  tempDir: string;
  input: NodeJS.ReadableStream;
  write(text: string): void;
  system: string;
  date: string;
  now(): number;
  timeouts?: CheckTimeouts | undefined;
}

/** 0 when every step passed, 1 when one failed, 2 for a usage error or a "no". */
export async function checkClaudeMain(options: CheckMainOptions): Promise<number> {
  const { write } = options;
  const args = parseCheckArgs(options.argv);
  if ('error' in args) {
    write(`${args.error}\n\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    write(USAGE);
    return 0;
  }
  write(INTRO);
  if (!args.yes && !(await askToContinue(options.input, write))) {
    write('Stopped. Nothing was run.\n');
    return 2;
  }
  write('\n');
  const report = await runSignedInCheck({
    platform: options.platform,
    tempDir: options.tempDir,
    claudePath: args.claudePath,
    write,
    system: options.system,
    date: options.date,
    now: options.now,
    timeouts: options.timeouts,
  });
  return report.passed ? 0 : 1;
}
